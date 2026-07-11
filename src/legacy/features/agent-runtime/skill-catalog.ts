const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

export const getSkillSearchText = (skill: any) => [
  skill?.id,
  skill?.title,
  skill?.module,
  skill?.level,
  skill?.summary,
  ...(Array.isArray(skill?.examples) ? skill.examples : []),
].map(normalize).filter(Boolean).join(' ');

export const filterSkillCatalog = (skills: any[] = [], query: unknown = '') => {
  const terms = normalize(query).split(/[\s,，、/]+/).filter(Boolean);
  if (!terms.length) return [...skills];
  return skills.filter((skill) => {
    const text = getSkillSearchText(skill);
    return terms.every((term) => text.includes(term));
  });
};

export const buildSkillCatalogSummary = (skills: any[] = [], coverage: {
  totalPages?: number;
  structuredPages?: number;
  issueCount?: number;
} = {}) => {
  const totalPages = Math.max(0, Number(coverage.totalPages || 0));
  const structuredPages = Math.max(0, Number(coverage.structuredPages || 0));
  return {
    totalSkills: skills.length,
    modules: new Set(skills.map((skill) => String(skill?.module || '其他'))).size,
    executableSkills: skills.filter((skill) => typeof skill?.handler === 'function').length,
    analysisSkills: skills.filter((skill) => String(skill?.level || '') === '分析型').length,
    totalPages,
    structuredPages,
    pageCoveragePercent: totalPages ? Math.round((structuredPages / totalPages) * 100) : 0,
    issueCount: Math.max(0, Number(coverage.issueCount || 0)),
  };
};
