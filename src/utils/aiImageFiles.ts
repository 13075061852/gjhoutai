/** Fetch the authenticated original, never a resized/rotated preview screenshot. */
export async function fetchAiImageFile(source: string, title: string, signal?: AbortSignal): Promise<File> {
  const response = await fetch(source, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('未获取到有效图片，请重新登录后重试');
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };
  const extension = extensions[blob.type.toLowerCase()] || 'img';
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i, '').replace(/[.\s]+$/g, '').slice(0, 100) || '图片';
  return new File([blob], `${name}.${extension}`, { type: blob.type });
}

export function downloadAiImageFile(file: File, container: HTMLElement): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.hidden = true;
  // Keep the activation link in the modal's top layer (background is inert).
  container.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel mobile downloads. This timer outlives closing the modal.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Must be invoked from a user click with an already prepared File (iOS activation). */
export async function shareAiImageFile(file: File): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
