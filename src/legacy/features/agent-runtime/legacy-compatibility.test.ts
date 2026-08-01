// The application build intentionally omits Node typings; Vitest supplies this runtime import.
// @ts-expect-error -- node test helper is available in the Vitest runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('legacy agent protocol removal', () => {
  it('removes executable text-call and old-loop markers from runtime sources', () => {
    const chat = readFileSync('src/legacy/features/chat.ts', 'utf8');
    const skills = readFileSync('src/legacy/features/project-skills.ts', 'utf8');
    expect(chat).not.toContain('runProjectAgentLoop');
    expect(chat).not.toContain('callProjectAgentPlanner');
    expect(skills).not.toContain('executeSkillCallFromText');
    expect(skills).not.toContain('gjhSkillCall');
  });
});
