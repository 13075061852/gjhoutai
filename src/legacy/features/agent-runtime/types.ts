export type AgentPlanKind =
  | 'local-tool'
  | 'web-search'
  | 'image-generation'
  | 'image-analysis'
  | 'chat';

export type AgentSkillPlan = {
  skillId: string;
  input: Record<string, any>;
  confidence?: number;
  reason?: string;
};

export type AgentPlan = {
  kind: AgentPlanKind;
  useProjectContext: boolean;
  needsWebSearch: boolean;
  wantsImageGeneration: boolean;
  wantsImageAnalysis: boolean;
  localSkillPlan: AgentSkillPlan | null;
  reason: string;
};

export type AgentImage = {
  type?: string;
  image_url?: { url?: string };
  url?: string;
  preview_url?: string;
  previewUrl?: string;
  label?: string;
  title?: string;
  code?: string;
  meta?: string;
};

export type AgentToolResult = {
  ok: boolean;
  message: string;
  details?: string[];
  data?: Record<string, any>;
  candidates?: any[];
};

