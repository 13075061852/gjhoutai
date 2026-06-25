import { describe, expect, it } from 'vitest';
import { normalizeSafeAvatarUrl } from './avatarSecurity';

describe('normalizeSafeAvatarUrl', () => {
  it('rejects attribute injection payloads', () => {
    expect(normalizeSafeAvatarUrl('blob:http://localhost/avatar" onerror="alert(1)')).toBeNull();
    expect(normalizeSafeAvatarUrl('https://example.com/a.png` onerror=alert(1)')).toBeNull();
  });

  it('rejects executable URL schemes', () => {
    expect(normalizeSafeAvatarUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSafeAvatarUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
  });

  it('allows expected avatar URL schemes', () => {
    expect(normalizeSafeAvatarUrl('blob:http://localhost/avatar-id')).toBe('blob:http://localhost/avatar-id');
    expect(normalizeSafeAvatarUrl('/api/profile/avatar', 'https://example.com/app')).toBe('https://example.com/api/profile/avatar');
  });
});
