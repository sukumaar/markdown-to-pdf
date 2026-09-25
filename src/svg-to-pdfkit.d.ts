declare module "svg-to-pdfkit" {
  function svgToPdf(
    document: PDFKit.PDFDocument,
    svg: string,
    x: number,
    y: number,
    options?: {
      width?: number;
      height?: number;
      assumePt?: boolean;
      fontCallback?: (family: string, bold: boolean, italic: boolean) => string;
    },
  ): void;
  export = svgToPdf;
}
