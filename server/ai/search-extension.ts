/** Only this pinned, reviewed extension is loaded; no user/project discovery. */
import webSearchExtension from 'pi-web-search';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function builtinSearch(pi: ExtensionAPI) {
  webSearchExtension({
    ...pi,
    registerTool(tool) {
      pi.registerTool({
        ...tool,
        async execute(...args) {
          const result = await tool.execute(...args);
          const details = result.details as Record<string, unknown> | undefined;
          // The upstream plugin reports failures in details rather than throwing.
          // Make them real failed tools, never successful-looking search evidence.
          if (details?.error) {
            const text = result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
            throw new Error(text || '联网搜索失败');
          }
          if (tool.name === 'web_search' && !details?.nativeSearchUsed && !details?.grounded) {
            throw new Error('当前模型未返回原生联网搜索证据，不能把普通模型回答当作搜索结果。');
          }
          return result;
        },
      });
    },
  });
}
