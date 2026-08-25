import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from './config.js';
import { UpstreamHttpError } from './http-errors.js';
import { createRealtimeMultipartBody, createRealtimeVoiceCall } from './realtime-voice.js';

const originalOpenAiKey = env.OPENAI_API_KEY;

describe('createRealtimeMultipartBody', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it('serializes SDP and session as plain FormData fields', () => {
    const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const body = createRealtimeMultipartBody(
      offer,
      {
        type: 'realtime',
        model: 'gpt-realtime-1.5',
      },
    );

    expect(body.get('sdp')).toBe(offer);
    expect(body.get('session')).toBe('{"type":"realtime","model":"gpt-realtime-1.5"}');
  });

  it('lets fetch create the multipart header and preserves the complete SDP offer', async () => {
    env.OPENAI_API_KEY = 'test-key';
    const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n', {
        status: 200,
        headers: { 'content-type': 'application/sdp' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRealtimeVoiceCall(offer)).resolves.toContain('v=0');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('content-type')).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('sdp')).toBe(offer);
  });

  it('preserves upstream 4xx failures as typed HTTP errors', async () => {
    env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: 'Failed to parse offer: failed to unmarshal SDP: EOF',
            },
          },
          { status: 400 },
        ),
      ),
    );

    const attempt = createRealtimeVoiceCall('v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n');
    await expect(attempt).rejects.toBeInstanceOf(UpstreamHttpError);
    await expect(attempt).rejects.toMatchObject({
      status: 400,
      message: 'Realtime voice session failed (400): Failed to parse offer: failed to unmarshal SDP: EOF',
    });
  });
});
