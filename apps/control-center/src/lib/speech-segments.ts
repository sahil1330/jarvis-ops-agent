const MAX_UNPUNCTUATED_CHARS = 320;
const PREFERRED_CHUNK_CHARS = 260;

function normalizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findNaturalBoundary(buffer: string): number {
  for (let index = 0; index < buffer.length; index += 1) {
    const character = buffer[index];
    if (character === '\n') return index + 1;
    if (!'.!?'.includes(character)) continue;

    let boundary = index + 1;
    while (boundary < buffer.length && /[*_~`]/.test(buffer[boundary] ?? '')) boundary += 1;
    const next = buffer[boundary];
    if (next === undefined || /\s/.test(next)) return boundary;
  }
  return -1;
}

function findLengthBoundary(buffer: string): number {
  if (buffer.length <= MAX_UNPUNCTUATED_CHARS) return -1;
  const preferred = buffer.lastIndexOf(' ', PREFERRED_CHUNK_CHARS);
  if (preferred > 60) return preferred + 1;
  const fallback = buffer.indexOf(' ', PREFERRED_CHUNK_CHARS);
  return fallback === -1 ? MAX_UNPUNCTUATED_CHARS : fallback + 1;
}

export function consumeSpeechSegments(
  currentBuffer: string,
  incomingText: string,
  flush = false,
): { segments: string[]; rest: string } {
  let rest = `${currentBuffer}${incomingText}`;
  const segments: string[] = [];

  while (rest.trim()) {
    let boundary = findNaturalBoundary(rest);
    if (boundary === -1) boundary = findLengthBoundary(rest);
    if (boundary === -1) break;

    const rawSegment = rest.slice(0, boundary);
    rest = rest.slice(boundary);
    const segment = normalizeForSpeech(rawSegment);
    if (segment) segments.push(segment);
  }

  if (flush && rest.trim()) {
    const segment = normalizeForSpeech(rest);
    if (segment) segments.push(segment);
    rest = '';
  }

  return { segments, rest };
}
