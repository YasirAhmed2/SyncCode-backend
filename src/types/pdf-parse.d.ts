declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PdfParseResult>;

  export default pdfParse;
}
