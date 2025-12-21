import { PDFDocument } from "pdf-lib";

export async function getPageCount(filePath: string): Promise<number> {
  const fileBuffer = await Bun.file(filePath).arrayBuffer();
  const pdfDoc = await PDFDocument.load(fileBuffer);
  return pdfDoc.getPageCount();
}
