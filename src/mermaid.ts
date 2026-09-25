import { renderMermaidSVG } from "beautiful-mermaid";
import svgToPdf from "svg-to-pdfkit";

interface DiagramOptions {
  margin: number;
  width: number;
  blackAndWhite: boolean;
}

function dimensions(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!match) throw new Error("Mermaid renderer returned SVG without dimensions");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new Error("Mermaid renderer returned invalid dimensions");
  }
  return { width, height };
}

export function drawMermaidDiagram(pdf: PDFKit.PDFDocument, source: string, options: DiagramOptions): void {
  const { margin, width, blackAndWhite } = options;
  if (source.length > 50_000) throw new Error("Mermaid diagram exceeds 50,000 character limit");
  const settings = { padding: 12, layerSpacing: 28, thoroughness: 1 };
  let svg = renderMermaidSVG(source, settings);
  let size = dimensions(svg);

  if (size.width > width * 1.5 && size.width / size.height > 2.5) {
    const vertical = source.replace(/\b(graph|flowchart)\s+LR\b/, "$1 TD").replace(/\b(graph|flowchart)\s+RL\b/, "$1 BT");
    if (vertical !== source) {
      svg = renderMermaidSVG(vertical, settings);
      size = dimensions(svg);
    }
  }

  // The SVG renderer emits CSS variables. Resolve them before PDFKit reads the SVG.
  svg = svg.replace(/<style>[\s\S]*?<\/style>/, "").replace(/\sstyle="[^"]*"/g, "");
  for (const [key, value] of Object.entries({
    "--_arrow": blackAndWhite ? "#000000" : "#64748b",
    "--_line": blackAndWhite ? "#000000" : "#94a3b8",
    "--_text": blackAndWhite ? "#000000" : "#24292f",
    "--_node-fill": blackAndWhite ? "#ffffff" : "#f7f9fb",
    "--_node-stroke": blackAndWhite ? "#000000" : "#cbd5e1",
  })) svg = svg.replaceAll(`var(${key})`, value);

  if (blackAndWhite) {
    svg = svg.replace(/<rect\b[^>]*>/g, (tag) => tag.replace(/\bfill="[^"]*"/, 'fill="#ffffff"').replace(/\bstroke="[^"]*"/, 'stroke="#000000"'));
    for (const match of svg.matchAll(/\b(?:fill|stroke|stop-color)="([^"]+)"/g)) {
      if (!["none", "#000000", "#ffffff"].includes(match[1]!)) {
        throw new Error("--bw cannot render this Mermaid diagram without color");
      }
    }
  }

  if (pdf.page.height - margin - pdf.y < 200) pdf.addPage();
  const availableHeight = pdf.page.height - margin - pdf.y - 15;
  const scale = Math.min(1.2, width / size.width, availableHeight / size.height);
  if (!(scale > 0)) throw new Error("Mermaid diagram is too large for page");
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  svg = svg.replace(/(<svg[^>]*\bwidth=")[^"]+/, `$1${drawWidth}`)
    .replace(/(<svg[^>]*\bheight=")[^"]+/, `$1${drawHeight}`);
  const y = pdf.y;
  svgToPdf(pdf, svg, margin + (width - drawWidth) / 2, y, {
    width: drawWidth, height: drawHeight, assumePt: true,
    fontCallback: (_family, bold) => bold ? "bold" : "body",
  });
  pdf.y = y + drawHeight + 12;
  pdf.x = margin;
}
