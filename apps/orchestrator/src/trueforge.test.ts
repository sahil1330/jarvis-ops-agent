import { afterEach, describe, expect, it, vi } from 'vitest';
import { trueforgeHealth } from './trueforge.js';

describe('trueforgeHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the plain-text health response used by TrueForge standalone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('OK!', { status: 200 })));

    await expect(trueforgeHealth()).resolves.toEqual({ connected: true });
  });

  it('preserves version metadata when a JSON health response provides it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ version: '0.1.4' }),
      ),
    );

    await expect(trueforgeHealth()).resolves.toEqual({ connected: true, version: '0.1.4' });
  });

  it('reports non-successful responses as disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));

    await expect(trueforgeHealth()).resolves.toEqual({ connected: false });
  });

  it('reports network failures as disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(trueforgeHealth()).resolves.toEqual({ connected: false });
  });
});
