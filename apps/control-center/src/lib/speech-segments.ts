const MAX_UNPUNCTUATED_CHARS = 320;
const PREFERRED_CHUNK_CHARS = 260;

const COMMON_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'a.m', 'p.m',
]);

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

function unmatchedFenceStart(buffer: string): number {
  let openAt = -1;
  for (let index = 0; index < buffer.length - 2; index += 1) {
    if (!buffer.startsWith('```', index)) continue;
    openAt = openAt === -1 ? index : -1;
    index += 2;
  }
  return openAt;
}

function periodIsAbbreviation(buffer: string, index: number): boolean {
  const previous = buffer[index - 1];
  const next = buffer[index + 1];
  if (previous && next && /\d/.test(previous) && /\d/.test(next)) return true;

  // Initialisms and forms such as e.g. / U.S. should remain one utterance.
  if (next && /[A-Za-z]/.test(next) && buffer[index + 2] === '.') return true;

  const tokenStart = Math.max(
    buffer.lastIndexOf(' ', index - 1),
    buffer.lastIndexOf('\n', index - 1),
    buffer.lastIndexOf('\t', index - 1),
  ) + 1;
  const token = buffer.slice(tokenStart, index).replace(/^["'([{]+/, '').toLowerCase();
  if (COMMON_ABBREVIATIONS.has(token)) return true;
  if (/^(?:[a-z]\.)+[a-z]$/i.test(token)) return true;
  return false;
}

function findNaturalBoundary(buffer: string): number {
  let inFence = false;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer.startsWith('```', index)) {
      inFence = !inFence;
      index += 2;
      continue;
    }
    if (inFence) continue;

    const character = buffer[index];
    if (character === '\n') return index + 1;
    if (!'.!?'.includes(character)) continue;
    if (character === '.' && periodIsAbbreviation(buffer, index)) continue;

    let boundary = index + 1;
    while (boundary < buffer.length && /[*_~`]/.test(buffer[boundary] ?? '')) boundary += 1;
    const next = buffer[boundary];
    if (next === undefined || /\s/.test(next)) return boundary;
  }
  return -1;
}

function findLengthBoundary(buffer: string): number {
  if (buffer.length <= MAX_UNPUNCTUATED_CHARS) return -1;

  // Never split an incomplete fenced code block into speech. We may still emit
  // prose that safely precedes the opening fence.
  const openFence = unmatchedFenceStart(buffer);
  const safeLimit = openFence === -1 ? buffer.length : openFence;
  if (safeLimit <= 60) return -1;

  const preferredLimit = Math.min(PREFERRED_CHUNK_CHARS, safeLimit);
  const preferred = buffer.lastIndexOf(' ', preferredLimit);
  if (preferred > 60) return preferred + 1;
  const fallback = buffer.indexOf(' ', preferredLimit);
  if (fallback !== -1 && fallback < safeLimit) return fallback + 1;
  return openFence === -1 ? Math.min(MAX_UNPUNCTUATED_CHARS, safeLimit) : -1;
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
    // If a fenced block is still incomplete, omit it instead of reading code
    // aloud. Any safe prose before it can still be spoken.
    const openFence = unmatchedFenceStart(rest);
    const safeRest = openFence === -1 ? rest : rest.slice(0, openFence);
    const segment = normalizeForSpeech(safeRest);
    if (segment) segments.push(segment);
    rest = '';
  }

  return { segments, rest };
}
