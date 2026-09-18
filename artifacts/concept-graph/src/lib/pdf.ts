// Safari < 16 lacks async iteration on ReadableStream, which causes pdf.js to crash 
// with "undefined is not a function" during getTextContent. This polyfill fixes it.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

// Safari < 17.4 lacks Promise.withResolvers, which pdf.js v4 heavily relies on.
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

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
