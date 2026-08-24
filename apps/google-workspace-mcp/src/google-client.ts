import { env, assertGoogleCredentials } from './config.js';

type TokenState = {
  accessToken: string;
  expiresAt: number;
};

type GoogleErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

let tokenState: TokenState | undefined;

async function getAccessToken(): Promise<string> {
  assertGoogleCredentials();

  if (tokenState && tokenState.expiresAt > Date.now() + 60_000) {
    return tokenState.accessToken;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  tokenState = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  return tokenState.accessToken;
}

export async function googleRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as GoogleErrorPayload;
      detail = parsed.error?.message ?? raw;
    } catch {
      // Keep the raw response when Google did not return JSON.
    }
    throw new Error(`Google API request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
