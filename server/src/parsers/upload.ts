import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import { unzipSync } from 'fflate';
import { ProblemError } from '../lib/problem';
export const MAX_UPLOAD = 5 * 1024 * 1024;
export async function parseUpload(buffer: Buffer): Promise<{kind: 'pdf' | 'docx'; text: string}> {
  if (buffer.length > MAX_UPLOAD) throw new ProblemError(413, 'file_too_large', 'Files must be 5 MB or smaller.');
  let kind: 'pdf' | 'docx'; let text: string;
  try {
    if (buffer.subarray(0, 4).toString() === '%PDF') {
      kind = 'pdf';
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      try {
        if (pdf.numPages > 100) throw new ProblemError(415, 'unsupported_file_type', 'Please upload a document of 100 pages or fewer.');
        text = (await extractText(pdf, {mergePages: true})).text;
      } finally {await pdf.cleanup();}
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      // Inspect uncompressed sizes before expansion; reject zip bombs and non-Word ZIP files.
      let expanded = 0;
      const entries = unzipSync(buffer, {filter: entry => {
        expanded += entry.originalSize;
        if (expanded > 20 * 1024 * 1024) throw new ProblemError(413, 'file_too_large', 'The expanded document is too large.');
        return entry.name === 'word/document.xml';
      }});
      if (!entries['word/document.xml']) throw new Error('Not a Word document');
      kind = 'docx'; text = (await mammoth.extractRawText({buffer})).value;
    } else throw new Error('Unknown signature');
  } catch (err) {
    if (err instanceof ProblemError) throw err;
    throw new ProblemError(415, 'unsupported_file_type', 'Upload a valid PDF or Word .docx file.');
  }
  text = text.trim();
  if (!text) throw new ProblemError(422, 'no_text_found', 'No text was found. For a scanned document, paste the text instead.');
  if (text.length > 50_000) throw new ProblemError(413, 'file_too_large', 'Extracted text must be at most 50,000 characters.');
  return {kind, text};
}
