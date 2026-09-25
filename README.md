# markdown-to-pdf

Bun + TypeScript CLI for Markdown to PDF. Uses PDFKit and browserless Mermaid
rendering. PDF output streams to disk; Markdown parsing uses memory proportional
to input size. Mermaid engine loads only when a diagram is present.

## Install

Requires Bun 1.3 or newer. Run these commands from `markdown-to-pdf/`:

```sh
mkdir -p .tmp .bun-cache
TMPDIR="$PWD/.tmp" bun install --frozen-lockfile
```

For deployment, use
`TMPDIR="$PWD/.tmp" bun install --production --frozen-lockfile`, then run
`bun src/cli.ts`. `bunfig.toml` keeps package cache in `.bun-cache` and disables
automatic runtime installs.

## Run

```sh
bun run convert tests/fixtures/sample.md -o sample.pdf
bun run convert ../books.md
bun run convert ../books.md -o books-bw.pdf --bw
bun run convert ../books.md -o books.pdf --force
bun run convert notes.md --page letter --font /path/to/font.ttf
bun run convert --help
```

Default output is `INPUT.pdf` in current working directory (`markdown-to-pdf/` for
commands above), even when input comes from another directory. `-o` accepts an
explicit path. Existing files require `--force`. Output is written to a
temporary file beside the destination, then committed after rendering succeeds.

`--bw` renders text and diagrams in black and white; raster images are rejected
in this mode. Color mode accepts local PNG/JPEG images relative to the Markdown
file. Mermaid support follows diagram types supported by `beautiful-mermaid`;
wide flowcharts switch to vertical layout for print. Emoji are omitted to avoid
empty squares.

Text support is limited to English letters. Other scripts may render
incorrectly, even with a custom font.

Limits:

- Markdown input: 20 MiB
- Each raster image: 20 MiB
- Mermaid block: 50,000 characters

Remote images are unsupported. Tables render as delimited rows.

## Test

```sh
bun test
bun run typecheck
bun run check
```

`bun run check` runs both TypeScript checking and Bun tests. Tests create
ignored scratch files in `.tmp/`. Source lives in `src/`; tests live in
`tests/`.

The integration test converts `tests/fixtures/sample.md` with the CLI and checks
PDF text using Poppler's `pdftotext` command, which must be installed to run the
test suite.
