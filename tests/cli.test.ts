import { expect, test } from "bun:test";
import { parseArgs, UsageError } from "../src/cli.ts";

test("default PDF path uses current working directory", () => {
  const options = parseArgs(["../docs/books.md"], "/workspace/tool");
  expect(options?.inputPath).toBe("/workspace/docs/books.md");
  expect(options?.outputPath).toBe("/workspace/tool/books.pdf");
});

test("parses explicit PDF options", () => {
  const options = parseArgs(["notes.md", "-o", "print.pdf", "--page", "letter", "--bw", "--force"], "/workspace");
  expect(options).toMatchObject({
    outputPath: "/workspace/print.pdf", pageSize: "LETTER", blackAndWhite: true, force: true,
  });
});

test("rejects invalid CLI arguments", () => {
  expect(() => parseArgs(["notes.md", "--page", "legal"])).toThrow(UsageError);
  expect(() => parseArgs(["notes.md", "-o"])).toThrow(UsageError);
  expect(() => parseArgs(["first.md", "second.md"])).toThrow(UsageError);
});
