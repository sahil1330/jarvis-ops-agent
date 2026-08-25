import { describe, expect, it } from 'vitest';
import { createRealtimeMultipartBody } from './realtime-voice.js';

describe('createRealtimeMultipartBody', () => {
  it('sends SDP and session as typed multipart parts', async () => {
    const offer = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';
    const form = createRealtimeMultipartBody(offer, {
      type: 'realtime',
      model: 'gpt-realtime-1.5',
    });

    const sdp = form.get('sdp');
    const session = form.get('session');

    expect(sdp).toBeInstanceOf(Blob);
    expect(session).toBeInstanceOf(Blob);
    if (!(sdp instanceof Blob) || !(session instanceof Blob)) throw new Error('Multipart parts were not blobs');

    expect(sdp.type).toBe('application/sdp');
    expect(await sdp.text()).toBe(offer);
    expect(session.type).toBe('application/json');
    expect(JSON.parse(await session.text())).toEqual({
      type: 'realtime',
      model: 'gpt-realtime-1.5',
    });
  });
});
