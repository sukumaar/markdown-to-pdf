#!/usr/bin/env bun
import { basename, extname, resolve } from "node:path";
import { convertMarkdownToPdf } from "./convert.ts";
import type { ConvertOptions, PageSize } from "./options.ts";

export const USAGE = `Usage: bun run src/cli.ts INPUT.md [options]

Options:
  -o, --output PATH       Output PDF (default: INPUT.pdf in current directory)
  --page a4|letter       Paper size (default: a4)
  --font PATH            TrueType/OpenType font
  --bw                   Black and white text and diagrams
  --force                Replace existing output
  -h, --help             Show help`;

export class UsageError extends Error {}

export function parseArgs(args: string[], cwd = process.cwd()): ConvertOptions | null {
  let input: string | undefined;
  let output: string | undefined;
  let font: string | undefined;
  let pageSize: PageSize = "A4";
  let blackAndWhite = false;
  let force = false;
  let positionalOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--" && !positionalOnly) { positionalOnly = true; continue; }
    if (!positionalOnly && (arg === "-h" || arg === "--help")) return null;
    if (!positionalOnly && ["-o", "--output", "--font", "--page"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("-")) throw new UsageError(`Missing value for ${arg}`);
      if (arg === "-o" || arg === "--output") output = value;
      else if (arg === "--font") font = value;
      else {
        const normalized = value.toUpperCase();
        if (normalized !== "A4" && normalized !== "LETTER") throw new UsageError("--page must be a4 or letter");
        pageSize = normalized;
      }
    } else if (!positionalOnly && (arg === "--bw" || arg === "--black-and-white")) blackAndWhite = true;
    else if (!positionalOnly && arg === "--force") force = true;
    else if (!positionalOnly && arg.startsWith("-")) throw new UsageError(`Unknown option: ${arg}`);
    else if (input) throw new UsageError("Provide exactly one input file");
    else input = arg;
  }
  if (!input) throw new UsageError("Missing Markdown input file");
  const inputPath = resolve(cwd, input);
  const outputPath = resolve(cwd, output ?? `${basename(inputPath, extname(inputPath))}.pdf`);
  return {
    inputPath, outputPath, pageSize,
    fontPath: font ? resolve(cwd, font) : undefined,
    blackAndWhite, force,
  };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(args);
    if (!options) { console.log(USAGE); return 0; }
    const path = await convertMarkdownToPdf(options);
    console.log(path);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    if (error instanceof UsageError) console.error(`\n${USAGE}`);
    return error instanceof UsageError ? 2 : 1;
  }
}

if (import.meta.main) process.exitCode = await main();
