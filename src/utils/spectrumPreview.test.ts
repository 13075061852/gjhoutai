import { describe, expect, it } from 'vitest';
import { removePreviewItem } from './spectrumPreview';
const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('remove a spectrum from preview without deleting source items', () => {
  it('moves to the next image when the active image is removed', () => {
    expect(removePreviewItem(items, 'b', 'b')).toEqual({ items: [items[0], items[2]], activeId: 'c' });
    expect(items).toHaveLength(3);
  });
  it('moves to the previous image when removing the last active image', () => {
    expect(removePreviewItem(items, 'c', 'c').activeId).toBe('b');
  });
  it('keeps the current image when removing another image', () => {
    expect(removePreviewItem(items, 'b', 'a').activeId).toBe('b');
  });
  it('returns an empty preview after removing the only image', () => {
    expect(removePreviewItem([items[0]], 'a', 'a')).toEqual({ items: [], activeId: '' });
  });
  it('ignores IDs outside the preview', () => {
    expect(removePreviewItem(items, 'a', 'missing')).toEqual({ items, activeId: 'a' });
  });
});
