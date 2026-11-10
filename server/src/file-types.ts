export type FileKind = 'cue' | 'audio';

export interface FileType {
  kind: FileKind;
  mime: string;
}

const TEXT_MIME = 'text/plain; charset=utf-8';

// Same extensions the Angular dropzone accepts.
const FILE_TYPES: Record<string, FileType> = {
  cue: { kind: 'cue', mime: TEXT_MIME },
  txt: { kind: 'cue', mime: TEXT_MIME },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  aiff: { kind: 'audio', mime: 'audio/aiff' },
  aif: { kind: 'audio', mime: 'audio/aiff' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  wma: { kind: 'audio', mime: 'audio/x-ms-wma' },
};

export function classifyFile(fileName: string): FileType | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return Object.hasOwn(FILE_TYPES, extension) ? FILE_TYPES[extension] : null;
}

// Keeps only the base name so a client-supplied path never reaches storage or headers.
export function sanitizeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = baseName.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, 255);
}
