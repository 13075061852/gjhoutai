const estimateMessageTokens = (message: any) => {
  const textTokens = Math.ceil(String(message?.content || '').length / 3);
  const imageTokens = Array.isArray(message?.images) ? message.images.length * 850 : 0;
  return Math.max(1, textTokens + imageTokens + 8);
};

export const selectRecentHistory = (messages: any[], maxTokens = 8000) => {
  const selected: any[] = [];
  let tokenCount = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageTokens = estimateMessageTokens(message);
    if (selected.length && tokenCount + messageTokens > maxTokens) break;
    selected.unshift(message);
    tokenCount += messageTokens;
  }
  return selected;
};

export const canRunLocalSkillDirectly = (plan: any, prompt: string, skills: any[]) => {
  const skillId = String(plan?.skillId || '');
  if (!skillId || shouldUseProjectAgentLoopForPrompt(prompt)) return false;
  if (skillId === 'media.analyzeImages' || skillId.startsWith('property.') || skillId === 'analysis.buildJointPackage') return false;
  return skills.some((skill) => skill.id === skillId && typeof skill.handler === 'function');
};
import { shouldUseProjectAgentLoopForPrompt } from '../agent-runtime/router';
