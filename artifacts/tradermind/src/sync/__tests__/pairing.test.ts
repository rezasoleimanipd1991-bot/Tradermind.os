// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { decodePairCode } from '../syncConfig';
import { resolveHub } from '../hubResolver';
import { SyncHttpError, HubUnreachableError, type Transport } from '../protocol';

const require = createRequire(import.meta.url);
const { buildPairCode } = require('../../../desktop/syncHub.cjs');

const TOKEN = 'a'.repeat(64);

describe('pair code', () => {
  it('decodes what the desktop app generates', () => {
    const code = buildPairCode(TOKEN, ['http://192.168.1.20:47821', 'http://100.64.0.5:47821/']);
    expect(decodePairCode(code)).toEqual({
      token: TOKEN,
      urls: ['http://192.168.1.20:47821', 'http://100.64.0.5:47821'],
    });
  });

  it('tolerates whitespace, line breaks and surrounding text', () => {
    const code: string = buildPairCode(TOKEN, ['http://10.0.0.2:47821']);
    const messy = `  کد من:\n${code.slice(0, 20)}\n${code.slice(20)}  \n`;
    expect(decodePairCode(messy)?.token).toBe(TOKEN);
  });

  it('rejects garbage, short tokens and non-http urls', () => {
    expect(decodePairCode('')).toBeNull();
    expect(decodePairCode('hello')).toBeNull();
    expect(decodePairCode('tm1.###')).toBeNull();
    expect(decodePairCode(buildPairCode('short', ['http://10.0.0.2:1']))).toBeNull();
    expect(decodePairCode(buildPairCode(TOKEN, ['javascript:alert(1)', 'file:///etc/passwd']))).toBeNull();
  });
});

describe('resolveHub', () => {
  const makeTransport = (alive: string[], wrongToken = false) => (url: string): Transport => ({
    async call() {
      if (!alive.includes(url)) throw new HubUnreachableError();
      if (wrongToken) throw new SyncHttpError(401, 'bad');
      return { ok: true };
    },
  });

  it('falls through dead addresses to a working one and tries the last good one first', async () => {
    const calls: string[] = [];
    const t = (url: string): Transport => ({
      async call() { calls.push(url); if (url !== 'http://tailscale') throw new HubUnreachableError(); return {}; },
    });
    const r = await resolveHub({ token: TOKEN, urls: ['http://lan', 'http://tailscale'], lastGoodUrl: 'http://tailscale' }, t);
    expect(r.url).toBe('http://tailscale');
    expect(calls).toEqual(['http://tailscale']);

    calls.length = 0;
    const r2 = await resolveHub({ token: TOKEN, urls: ['http://lan', 'http://tailscale'] }, t);
    expect(r2.url).toBe('http://tailscale');
    expect(calls).toEqual(['http://lan', 'http://tailscale']);
  });

  it('reports unreachable when nothing answers', async () => {
    await expect(resolveHub({ token: TOKEN, urls: ['http://a', 'http://b'] }, makeTransport([]))).rejects.toBeInstanceOf(HubUnreachableError);
  });

  it('stops immediately on a wrong token instead of trying other addresses', async () => {
    await expect(resolveHub({ token: TOKEN, urls: ['http://a', 'http://b'] }, makeTransport(['http://a', 'http://b'], true)))
      .rejects.toBeInstanceOf(SyncHttpError);
  });
});
