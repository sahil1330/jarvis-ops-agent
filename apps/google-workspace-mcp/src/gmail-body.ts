export type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

export const MAX_THREAD_BODY_CHARACTERS = 12_000;
const MAX_ENCODED_BODY_CHARACTERS = Math.ceil(MAX_THREAD_BODY_CHARACTERS * 4 / 3) + 16;

function decodeBounded(data: string): string {
  try {
    const bounded = data.slice(0, MAX_ENCODED_BODY_CHARACTERS);
    return Buffer.from(bounded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      .toString('utf8')
      .slice(0, MAX_THREAD_BODY_CHARACTERS);
  } catch {
    return '';
  }
}

function htmlToText(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
    .slice(0, MAX_THREAD_BODY_CHARACTERS);
}

function findPart(part: GmailPart | undefined, mimeType: string): string | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return decodeBounded(part.body.data);
  for (const child of part.parts ?? []) {
    const value = findPart(child, mimeType);
    if (value) return value;
  }
  return undefined;
}

export function readableMessageBody(payload: GmailPart | undefined, snippet = ''): string {
  const plain = findPart(payload, 'text/plain')?.trim();
  if (plain) return plain.slice(0, MAX_THREAD_BODY_CHARACTERS);

  const html = findPart(payload, 'text/html');
  if (html) {
    const text = htmlToText(html);
    if (text) return text;
  }

  if (payload?.body?.data) {
    const fallback = decodeBounded(payload.body.data).trim();
    if (fallback) return fallback;
  }
  return snippet.slice(0, MAX_THREAD_BODY_CHARACTERS);
}
