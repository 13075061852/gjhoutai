import { describe, expect, it } from 'vitest';
import chatSource from '../legacy/features/chat.ts?raw';
import apimartSource from '../legacy/features/apimart-media.ts?raw';

describe('media preview dialog primitives', () => {
  it('uses the shared dialog overlay and close button in chat', () => {
    expect(chatSource).toContain("preview.className = 'dialog-overlay chat-image-preview'");
    expect(chatSource).toContain('ui-button dialog-close chat-image-preview-close');
  });

  it('uses the shared dialog structure for image and video previews', () => {
    expect(apimartSource).toContain("'dialog-overlay apimart-image-preview'");
    expect(apimartSource).toContain('dialog-card apimart-image-preview-dialog');
    expect(apimartSource).toContain('ui-dialog-header apimart-image-preview-head');
    expect(apimartSource).toContain('ui-button dialog-close apimart-image-preview-close');
  });
});
