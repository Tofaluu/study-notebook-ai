import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?worker';

// Use Vite's worker to avoid CDN 404s and Safari cross-origin blocks
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export interface LecturePage {
  pageNumber: number;
  text: string;
}

export async function extractTextFromPDF(file: File): Promise<{ text: string, pages: LecturePage[], pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const numPages = pdf.numPages;
  const pages: LecturePage[] = [];
  let fullText = '';
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    // Extract strings from text items
    const strings = content.items.map(item => {
      // type checking for TextItem since item can be TextItem | TextMarkedContent
      if ('str' in item) {
        return item.str;
      }
      return '';
    });
    
    // Join with spaces, roughly maintaining spacing
    const pageText = strings.join(' ');
    
    pages.push({
      pageNumber: i,
      text: pageText,
    });
    
    fullText += pageText + '\n\n';
  }
  
  return {
    text: fullText,
    pages,
    pageCount: numPages
  };
}
