import { describe, expect, it } from 'vitest';
import config from './config.ts?raw';
import aiAnalysis from './ai-analysis.ts?raw';
import spectrum from './spectrum-analysis.ts?raw';

describe('single model selection across analysis features', () => {
  it('does not mount independent analysis model controls and clears legacy overrides', () => {
    expect(config).not.toContain('mountAgentRoutingConfigSection');
    expect(config).not.toContain('数据分析模型</span>');
    expect(config).not.toContain('图谱分析模型</span>');
    expect(config).not.toContain('getAgentModelRefs');
    expect(config).not.toContain('syncAgentModelSelects');
  });
  it('delegates the rewritten assistant model selection to the server', () => {
    expect(aiAnalysis).toContain('await aiAnalysis.start(');
    expect(aiAnalysis).not.toContain('/chat/completions');
    expect(aiAnalysis).not.toContain('getFormConfig');
    expect(aiAnalysis).not.toContain('apiKey');
  });
  it('removes the unreachable browser spectrum AI and Agent mutation paths', () => {
    expect(spectrum).not.toContain('/chat/completions');
    expect(spectrum).not.toContain('getSpectrumAiConfig');
    expect(spectrum).not.toContain('ByAgent');
    expect(spectrum).not.toContain('App.projectSkills');
    expect(spectrum).not.toContain('App.aiCallAnalysis');
  });
});
