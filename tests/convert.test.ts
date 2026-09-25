import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { convertMarkdownToPdf } from "../src/convert.ts";
import type { ConvertOptions } from "../src/options.ts";

const scratchRoot = resolve(import.meta.dir, "../.tmp");
const run = promisify(execFile);

async function withScratch(run: (directory: string) => Promise<void>): Promise<void> {
  await mkdir(scratchRoot, { recursive: true });
  const directory = await mkdtemp(join(scratchRoot, "test-"));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function options(directory: string, overrides: Partial<ConvertOptions> = {}): ConvertOptions {
  return {
    inputPath: join(directory, "source.md"), outputPath: join(directory, "result.pdf"),
    pageSize: "A4", blackAndWhite: false, force: false, ...overrides,
  };
}

test("creates valid PDF with browserless Mermaid and monochrome rendering", async () => {
  await withScratch(async (directory) => {
    const config = options(directory, { blackAndWhite: true });
    await writeFile(config.inputPath, "# Example\n\n```mermaid\ngraph LR\nA[Start] --> B[End]\n```\n");
    await convertMarkdownToPdf(config);
    const bytes = await readFile(config.outputPath);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

test("CLI converts sample Markdown into readable color and monochrome PDFs", async () => {
  await withScratch(async (directory) => {
    const input = resolve(import.meta.dir, "fixtures/sample.md");
    const cli = resolve(import.meta.dir, "../src/cli.ts");
    for (const variant of [
      { output: join(directory, "sample.pdf"), args: [] },
      { output: join(directory, "sample-bw.pdf"), args: ["-o", "sample-bw.pdf", "--bw"] },
    ]) {
      const { stdout } = await run(process.execPath, [cli, input, ...variant.args], { cwd: directory });
      expect(stdout.trim()).toBe(variant.output);

      const bytes = await readFile(variant.output);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

      const extracted = (await run("pdftotext", ["-layout", variant.output, "-"])).stdout;
      for (const content of [
        "Sample Report", "bold text", "emphasis", "Prepare source",
        "Draft", "Editor", "const ready = true;", "Draft ready", "PDF published",
      ]) expect(extracted).toContain(content);
      expect(extracted).not.toContain("flowchart LR");
    }
  });
});

test("render failure preserves existing PDF and removes temporary output", async () => {
  await withScratch(async (directory) => {
    const config = options(directory, { force: true });
    await writeFile(config.inputPath, "![missing](missing.png)\n");
    await writeFile(config.outputPath, "original PDF bytes");
    await expect(convertMarkdownToPdf(config)).rejects.toThrow("image not found");
    expect(await readFile(config.outputPath, "utf8")).toBe("original PDF bytes");
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

test("does not replace existing output without --force", async () => {
  await withScratch(async (directory) => {
    const config = options(directory);
    await writeFile(config.inputPath, "# Example\n");
    await writeFile(config.outputPath, "keep this");
    await expect(convertMarkdownToPdf(config)).rejects.toThrow("Output exists");
    expect(await readFile(config.outputPath, "utf8")).toBe("keep this");
  });
});

test("does not replace input through an output symlink", async () => {
  await withScratch(async (directory) => {
    const config = options(directory, { force: true });
    await writeFile(config.inputPath, "# Keep source\n");
    await symlink(config.inputPath, config.outputPath);
    await expect(convertMarkdownToPdf(config)).rejects.toThrow("same file");
    expect(await readFile(config.inputPath, "utf8")).toBe("# Keep source\n");
  });
});
