export const buildAgentContextSnapshot = (App: any, {
  question = '',
  activePageId = '',
  forceCurrentPage = false,
} = {} as any) => {
  const manifest = App?.agentButler?.getProjectManifest?.() || App?.projectSkills?.getProjectManifest?.() || null;
  const context = App?.agentButler?.buildContext?.({ question, activePageId, forceCurrentPage }) || '';
  const images = App?.agentButler?.getImages?.({ question, activePageId, forceCurrentPage }) || [];
  return {
    manifest,
    context,
    images,
    activePageId,
    hasContext: Boolean(String(context || '').trim()),
    imageCount: Array.isArray(images) ? images.length : 0,
  };
};
