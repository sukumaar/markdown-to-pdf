import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import MarkdownIt from "markdown-it";

type Token = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

export interface RenderOptions {
  inputPath: string;
  fontPath?: string;
  blackAndWhite: boolean;
}

export async function renderMarkdown(pdf: PDFKit.PDFDocument, markdown: string, options: RenderOptions): Promise<void> {
  const { inputPath, fontPath, blackAndWhite } = options;
  const md = new MarkdownIt({ html: false, linkify: true });
  const tokens = md.parse(markdown, {});
  const mermaid = tokens.some((token) => token.type === "fence" && token.info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid")
    ? await import("./mermaid.ts") : null;
  const systemFont = fontPath ?? [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ].find(existsSync) ?? "Helvetica";
  const boldFont = fontPath ?? [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
  ].find(existsSync) ?? systemFont;
  pdf.registerFont("body", systemFont).registerFont("bold", boldFont);
  pdf.font("body").fontSize(10.5).fillColor(blackAndWhite ? "#000000" : "#24292f");
  const margin = 48;
  const width = pdf.page.width - margin * 2;
  let depth = 0;
  let quote = 0;
  let marker = "";
  const ordered: number[] = [];
  const gap = (n: number) => { pdf.y += n; };
  const ensure = (n: number) => { if (pdf.y + n > pdf.page.height - margin) pdf.addPage(); };
  const plain = (token: Token) => (token.children ?? []).map(t => t.type === "image" ? (t.content || t.attrGet("alt") || "[image]") : t.type === "softbreak" ? " " : t.type === "hardbreak" ? "\n" : ["text", "code_inline"].includes(t.type) ? t.content : "").join("");
  const printable = (text: string) => text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
  const drawInline = (token: Token, size: number, x: number, available: number, heading = false) => {
    const children = token.children ?? [];
    if (!children.length) return;
    let bold = heading;
    let italic = false;
    let link: string | null = null;
    const chunks: { text: string; bold: boolean; italic: boolean; link: string | null }[] = [];
    for (const child of children) {
      if (child.type === "strong_open") bold = true;
      else if (child.type === "strong_close") bold = heading;
      else if (child.type === "em_open") italic = true;
      else if (child.type === "em_close") italic = false;
      else if (child.type === "link_open") {
        const target = String(child.attrGet("href") ?? "");
        link = /^(https?:|mailto:)/i.test(target) ? target : null;
      }
      else if (child.type === "link_close") link = null;
      else if (["text", "code_inline", "softbreak", "hardbreak", "image"].includes(child.type)) {
        const text = child.type === "softbreak" ? " " : child.type === "hardbreak" ? "\n" : child.type === "image" ? (child.content || "[image]") : child.content;
        const rendered = printable(text);
        if (rendered) chunks.push({ text: rendered, bold: bold || child.type === "code_inline", italic, link });
      }
    }
    if (!chunks.length) return;
    ensure(size * 2.5);
    const y = pdf.y;
    chunks.forEach((part, i) => {
      pdf.font(part.bold ? "bold" : "body").fontSize(size).fillColor(blackAndWhite ? "#000000" : part.link ? "#0969da" : "#24292f");
      const options = {
        width: available, continued: i < chunks.length - 1, lineGap: size * 0.25,
        oblique: part.italic, link: part.link, underline: !!part.link,
      };
      if (i === 0) pdf.text(part.text, x, y, options);
      else pdf.text(part.text, options);
    });
    pdf.font("body").fontSize(10.5).fillColor(blackAndWhite ? "#000000" : "#24292f");
  };
  const image = (token: Token) => {
    if (blackAndWhite) throw new Error("--bw requires a Markdown file without raster images");
    const source = String(token.attrGet("src") ?? "");
    if (/^[a-z]+:/i.test(source)) throw new Error(`Remote image unsupported: ${source}`);
    const path = resolve(dirname(inputPath), source);
    if (!existsSync(path) || !/\.(png|jpe?g)$/i.test(path)) throw new Error(`PNG/JPEG image not found: ${path}`);
    const imageFile = statSync(path);
    if (!imageFile.isFile() || imageFile.size > 20 * 1024 * 1024) throw new Error(`Image must be a file under 20 MiB: ${path}`);
    const imageInfo = (pdf as PDFKit.PDFDocument & { openImage(p: string): { width: number; height: number } }).openImage(path);
    const maxW = width - depth * 18;
    const maxH = pdf.page.height - margin * 2 - 20;
    const scale = Math.min(1, maxW / imageInfo.width, maxH / imageInfo.height);
    const w = imageInfo.width * scale;
    const h = imageInfo.height * scale;
    ensure(h + 10);
    pdf.image(path, margin + depth * 18 + (maxW - w) / 2, pdf.y, { width: w, height: h });
    pdf.y += h + 10;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === "heading_open") {
      const inline = tokens[++i]!;
      const level = Number(token.tag.slice(1));
      const size = [0, 21, 17, 14, 12, 11, 10.5][level] ?? 10.5;
      gap(level <= 2 ? 14 : 9);
      ensure(size * 2.8);
      drawInline(inline, size, margin + depth * 18, width - depth * 18, true);
      gap(9);
    } else if (token.type === "paragraph_open") {
      const inline = tokens[++i]!;
      const children = inline.children ?? [];
      if (children.length === 1 && children[0]?.type === "image") image(children[0]);
      else {
        const x = margin + depth * 18 + quote * 14;
        if (marker) ensure(60);
        const y = pdf.y;
        if (marker) {
          pdf.font("body").fontSize(10.5).text(marker, x, y, { width: 20, lineBreak: false });
          pdf.y = y;
        }
        drawInline(inline, 10.5, x + (marker ? 20 : 0), width - depth * 18 - quote * 14 - (marker ? 20 : 0));
        marker = "";
        gap(7);
      }
    } else if (token.type === "bullet_list_open") { depth++; ordered.push(0); }
    else if (token.type === "ordered_list_open") { depth++; ordered.push(Number(token.attrGet("start") ?? 1)); }
    else if (token.type === "bullet_list_close" || token.type === "ordered_list_close") { depth--; ordered.pop(); gap(3); }
    else if (token.type === "list_item_open") { const n = ordered.length - 1; marker = ordered[n] ? `${ordered[n]++}.` : "•"; }
    else if (token.type === "blockquote_open") quote++;
    else if (token.type === "blockquote_close") { quote--; gap(3); }
    else if (token.type === "fence" && token.info.trim().split(/\s+/)[0]?.toLowerCase() === "mermaid") {
      if (!mermaid) throw new Error("Mermaid renderer unavailable");
      mermaid.drawMermaidDiagram(pdf, token.content, { margin, width, blackAndWhite });
    } else if (token.type === "fence" || token.type === "code_block") {
      gap(3);
      for (const line of token.content.replace(/\n$/, "").split("\n")) {
        pdf.font("body").fontSize(9);
        const x = margin + depth * 18;
        const w = width - depth * 18;
        const h = Math.max(15, pdf.heightOfString(line || " ", { width: w - 16 }) + 6);
        ensure(h);
        const y = pdf.y;
        pdf.save().fillColor(blackAndWhite ? "#ffffff" : "#f3f5f7").strokeColor(blackAndWhite ? "#000000" : "#f3f5f7").rect(x, y, w, h).fillAndStroke().restore();
        pdf.fillColor(blackAndWhite ? "#000000" : "#24292f").text(line || " ", x + 8, y + 3, { width: w - 16 });
        pdf.y = y + h;
      }
      gap(9);
    } else if (token.type === "hr") {
      gap(8); ensure(5);
      pdf.save().strokeColor(blackAndWhite ? "#000000" : "#ced4da").moveTo(margin, pdf.y).lineTo(pdf.page.width - margin, pdf.y).stroke().restore();
      gap(12);
    } else if (token.type === "table_open") {
      const rows: string[][] = [];
      let row: string[] = [];
      while (++i < tokens.length && tokens[i]?.type !== "table_close") {
        if (tokens[i]?.type === "tr_open") row = [];
        else if (tokens[i]?.type === "inline") row.push(plain(tokens[i]!));
        else if (tokens[i]?.type === "tr_close") rows.push(row);
      }
      for (const [index, cells] of rows.entries()) {
        ensure(25);
        pdf.font(index ? "body" : "bold").fontSize(9).text(cells.join("   |   "), margin + depth * 18, pdf.y, { width: width - depth * 18 });
        gap(5);
      }
      gap(5);
    }
  }
}
