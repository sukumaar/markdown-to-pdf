import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { link, lstat, mkdir, realpath, rename, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { finished } from "node:stream/promises";
import PDFDocument from "pdfkit";
import { renderMarkdown } from "./renderer.ts";
import type { ConvertOptions } from "./options.ts";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

async function existingFile(path: string) {
  try { return await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function convertMarkdownToPdf(options: ConvertOptions): Promise<string> {
  const inputPath = resolve(options.inputPath);
  const outputPath = resolve(options.outputPath);
  const inputInfo = await stat(inputPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new Error(`Input file not found: ${inputPath}`);
    throw error;
  });
  if (!inputInfo.isFile()) throw new Error(`Input is not a file: ${inputPath}`);
  if (inputInfo.size > MAX_INPUT_BYTES) throw new Error("Markdown input exceeds 20 MiB limit");
  if (inputPath === outputPath) throw new Error("Input and output paths must differ");
  if (options.fontPath) {
    const fontInfo = await stat(options.fontPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw new Error(`Font not found: ${options.fontPath}`);
      throw error;
    });
    if (!fontInfo.isFile()) throw new Error(`Font is not a file: ${options.fontPath}`);
  }

  const existing = await existingFile(outputPath);
  if (existing) {
    if (!options.force) throw new Error(`Output exists: ${outputPath}; use --force`);
    if (existing.isDirectory()) throw new Error(`Output is a directory: ${outputPath}`);
    const outputTarget = await stat(outputPath).catch(() => null);
    if (outputTarget && outputTarget.dev === inputInfo.dev && outputTarget.ino === inputInfo.ino) {
      throw new Error("Input and output refer to the same file");
    }
  }
  if (await realpath(inputPath) === await realpath(outputPath).catch(() => null)) {
    throw new Error("Input and output refer to the same file");
  }

  const markdown = await Bun.file(inputPath).text();
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = join(dirname(outputPath), `.md-to-pdf-${randomUUID()}.tmp`);
  const stream = createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 });
  const completed = finished(stream);
  void completed.catch(() => {});
  const pdf = new PDFDocument({ size: options.pageSize, margin: 48, bufferPages: false, compress: true });
  pdf.on("error", (error) => stream.destroy(error));
  pdf.pipe(stream);

  try {
    await renderMarkdown(pdf, markdown, {
      inputPath, fontPath: options.fontPath, blackAndWhite: options.blackAndWhite,
    });
    pdf.end();
    await completed;
    if (options.force) await rename(temporaryPath, outputPath);
    else {
      await link(temporaryPath, outputPath);
      await unlink(temporaryPath);
    }
    return outputPath;
  } catch (error) {
    pdf.destroy();
    stream.destroy();
    await completed.catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}
