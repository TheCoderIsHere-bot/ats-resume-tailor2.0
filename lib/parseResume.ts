import { assertServerOnly } from '@/lib/env';
import { validateAndSanitizeText } from '@/lib/validation';

assertServerOnly('lib/parseResume');

/**
 * Shared Resume File Validation & Extraction Helper
 *
 * Enforces:
 * - Strict 5 MB max & 100-byte min file bounds
 * - Strict filename sanitization (blocks path traversal & double executable extensions)
 * - Extension + MIME consistency checks
 * - Magic-byte verification (%PDF- / PK\x03\x04)
 * - Structural & active-script checks (blocks PDF /JavaScript /Launch & DOCX macros/XXE/invalid ZIPs)
 * - Control-character & null-byte stripping on extracted text
 */

const MIN_FILE_SIZE = 100;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PDF_MIMES = new Set(['application/pdf', 'application/x-pdf', '']);
const ALLOWED_DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  '',
]);

const UNSAFE_EXECUTABLE_EXT_REGEX = /\.(exe|bat|cmd|sh|ps1|vbs|js|mjs|cjs|html|htm|svg|php|py|rb|dll|msi|scr)\./i;

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
  const leaf = rawName.split(/[/\\]/).pop() ?? '';
  const base = leaf.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.').slice(0, 100);
  if (!base) return `resume${ext}`;
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

export async function parseResumeFile(
  file: File
): Promise<ParsedResumeResult | ParsedResumeError> {
  if (!file || typeof file.name !== 'string') {
    return { ok: false, error: 'Invalid file upload.', status: 400 };
  }

  if (file.size < MIN_FILE_SIZE) {
    return {
      ok: false,
      error: 'Uploaded file is empty or corrupted.',
      status: 400,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: 'File is too large. Maximum allowed size is 5MB.',
      status: 413,
    };
  }

  const rawName = file.name;
  if (rawName.includes('..') || rawName.includes('\0') || UNSAFE_EXECUTABLE_EXT_REGEX.test(rawName)) {
    return {
      ok: false,
      error: 'Unsafe or invalid filename.',
      status: 400,
      securityViolation: 'UNSAFE_UPLOAD_FILENAME',
    };
  }

  const lowerName = rawName.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const isPdfByExt = lowerName.endsWith('.pdf');
  const isDocxByExt = lowerName.endsWith('.docx');

  if (!isPdfByExt && !isDocxByExt) {
    return {
      ok: false,
      error: 'Unsupported file type. Please upload a valid .pdf or .docx file.',
      status: 400,
    };
  }

  if (isPdfByExt && !ALLOWED_PDF_MIMES.has(mime)) {
    return {
      ok: false,
      error: 'File MIME type does not match .pdf extension.',
      status: 400,
      securityViolation: `MIME_EXTENSION_MISMATCH:${mime}`,
    };
  }

  if (isDocxByExt && !ALLOWED_DOCX_MIMES.has(mime)) {
    return {
      ok: false,
      error: 'File MIME type does not match .docx extension.',
      status: 400,
      securityViolation: `MIME_EXTENSION_MISMATCH:${mime}`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const hasPdfMagic =
    buffer.length >= 8 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
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

    // Reject active PDF exploit vectors (/JavaScript, /Launch actions, HTML script polyglots)
    const headerSlice = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString('latin1');
    if (/\/(?:JavaScript|JS|Launch)\b/.test(headerSlice) || /<script[\s>]/i.test(headerSlice)) {
      return {
        ok: false,
        error: 'PDF contains active scripts or unsupported embedded actions.',
        status: 400,
        securityViolation: 'ACTIVE_SCRIPT_IN_PDF',
      };
    }

    const { extractText } = await import('unpdf');
    const { text: extractedText } = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    text = extractedText;
    ext = '.pdf';
    contentType = 'application/pdf';
  } else {
    if (!hasDocxMagic) {
      return {
        ok: false,
        error: 'Invalid DOCX file. The file content does not match the DOCX standard.',
        status: 400,
        securityViolation: 'MAGIC_BYTE_MISMATCH_DOCX',
      };
    }

    // Verify OOXML ZIP directory structure & reject macro-laden or XXE-injected archives
    const hasContentTypes = buffer.includes(Buffer.from('[Content_Types].xml'));
    const hasWordDocument = buffer.includes(Buffer.from('word/document.xml'));
    if (!hasContentTypes || !hasWordDocument) {
      return {
        ok: false,
        error: 'Invalid DOCX archive structure.',
        status: 400,
        securityViolation: 'INVALID_DOCX_STRUCTURE',
      };
    }

    if (buffer.includes(Buffer.from('vbaProject.bin')) || buffer.includes(Buffer.from('<!ENTITY'))) {
      return {
        ok: false,
        error: 'DOCX file contains macros or disallowed XML entities.',
        status: 400,
        securityViolation: 'DOCX_MACRO_OR_XXE',
      };
    }

    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    ext = '.docx';
    contentType =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  const sanitized = validateAndSanitizeText(text, {
    minLength: 50,
    maxLength: 50000,
    allowNewlines: true,
    label: 'Extracted resume text',
  });

  if (!sanitized.ok) {
    return {
      ok: false,
      error:
        text.trim().length < 50
          ? 'Could not extract text from the file. Please ensure it is not image-only.'
          : sanitized.error,
      status: 422,
    };
  }

  return {
    ok: true,
    text: sanitized.text,
    ext,
    contentType,
    safeFilename: sanitizeUploadFilename(rawName, ext),
    buffer,
  };
}
