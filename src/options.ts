export type PageSize = "A4" | "LETTER";

export interface ConvertOptions {
  inputPath: string;
  outputPath: string;
  pageSize: PageSize;
  fontPath?: string;
  blackAndWhite: boolean;
  force: boolean;
}
