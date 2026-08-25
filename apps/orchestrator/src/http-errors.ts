const MAX_ERROR_DETAIL_CHARACTERS = 1_000;

export class UpstreamHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = status;
  }
}

export async function createUpstreamHttpError(response: Response, prefix: string): Promise<UpstreamHttpError> {
  const body = (await response.text()).trim().slice(0, MAX_ERROR_DETAIL_CHARACTERS);
  let detail = body;

  if (body) {
    try {
      const payload = JSON.parse(body) as { error?: { message?: unknown } };
      if (typeof payload.error?.message === 'string' && payload.error.message.trim()) detail = payload.error.message.trim();
    } catch {
      // Preserve the raw body when the upstream response is not JSON.
    }
  }

  return new UpstreamHttpError(response.status, detail ? `${prefix} (${response.status}): ${detail}` : `${prefix} (${response.status})`);
}
