/**
 * Shared Resume File Validation & Extraction Helper
 *
 * Enforces:
 * - Strict 5 MB size cap (prevents memory DoS)
 * - File magic-byte verification (%PDF- / PK\x03\x04) to prevent disguised uploads
 * - Minimum extracted text threshold (blocks empty/image-only files)
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface ParsedResumeResult {
  ok: true;
  text: string;
  ext: '.pdf' | '.docx';
  contentType: string;
  safeFilename: string;
  buffer: Buffer;
}

export interface ParsedResumeError {
  ok: false;
  error: string;
  status: number;
  securityViolation?: string;
}

export function sanitizeUploadFilename(rawName: string, ext: '.pdf' | '.docx'): string {
  const base = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  if (!base) return `resume${ext}`;
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

export async function parseResumeFile(
  file: File
): Promise<ParsedResumeResult | ParsedResumeError> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: 'File is too large. Maximum allowed size is 5MB.',
      status: 413,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const lowerName = file.name.toLowerCase();
  const isPdfByExt = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocxByExt =
    lowerName.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const hasPdfMagic =
    buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const hasDocxMagic =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  let text = '';
  let ext: '.pdf' | '.docx';
  let contentType: string;

  if (isPdfByExt) {
    if (!hasPdfMagic) {
      return {
        ok: false,
        error: 'Invalid PDF file. The file content does not match the PDF standard.',
        status: 400,
        securityViolation: 'MAGIC_BYTE_MISMATCH_PDF',
      };
    }
    const { extractText } = await import('unpdf');
    const { text: extractedText } = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    text = extractedText;
    ext = '.pdf';
    contentType = 'application/pdf';
  } else if (isDocxByExt) {
    if (!hasDocxMagic) {
      return {
        ok: false,
        error: 'Invalid DOCX file. The file content does not match the DOCX standard.',
        status: 400,
        securityViolation: 'MAGIC_BYTE_MISMATCH_DOCX',
      };
    }
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    ext = '.docx';
    contentType =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else {
    return {
      ok: false,
      error: 'Unsupported file type. Please upload a valid PDF or .docx file.',
      status: 400,
    };
  }

  if (!text || text.trim().length < 50) {
    return {
      ok: false,
      error:
        'Could not extract text from the file. Please ensure it is not image-only.',
      status: 422,
    };
  }

  return {
    ok: true,
    text: text.trim(),
    ext,
    contentType,
    safeFilename: sanitizeUploadFilename(file.name, ext),
    buffer,
  };
}
