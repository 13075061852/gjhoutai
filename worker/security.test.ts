import { describe, expect, it } from 'vitest';
import { contentDisposition, isPublicStorageKey, isTrustedMutation, readLimitedBody } from './security';

describe('request boundary helpers', () => {
  it('allows same-origin and explicitly configured frontend writes only', () => {
    const make = (origin: string) => new Request('https://api.example/api/state/key', { method: 'PUT', headers: { origin } });
    expect(isTrustedMutation(make('https://api.example'))).toBe(true);
    expect(isTrustedMutation(make('https://app.example'), 'https://app.example')).toBe(true);
    expect(isTrustedMutation(make('https://app.example.evil'), 'https://app.example')).toBe(false);
    expect(isTrustedMutation(make('null'), 'null')).toBe(false);
    expect(isTrustedMutation(new Request('https://api.example', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }))).toBe(false);
  });

  it('bounds the actual stream even without Content-Length', async () => {
    const request = new Request('https://api.example', { method: 'POST', body: '12345' });
    await expect(readLimitedBody(request, 4)).rejects.toMatchObject({ status: 413 });
    expect(new TextDecoder().decode(await readLimitedBody(new Request('https://api.example', { method: 'POST', body: '1234' }), 4))).toBe('1234');
  });

  it.each(['users/victim/key', 'users\\victim', '.', '..', 'key\u0000', ''])('rejects internal or invalid keys: %s', (key) => {
    expect(isPublicStorageKey(key)).toBe(false);
  });

  it('encodes Chinese download filenames into valid HTTP headers', () => {
    const value = contentDisposition('inline', '检测报告.pdf');
    expect(() => new Headers({ 'content-disposition': value })).not.toThrow();
    expect(value).toContain("filename*=UTF-8''%E6%A3%80");
    expect(contentDisposition('attachment', 'a\r\n".pdf')).not.toMatch(/[\r\n]/);
  });
});
