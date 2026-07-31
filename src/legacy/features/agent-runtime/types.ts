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

export type {
  AgentConfirmation,
  AgentIntent,
  AgentPlanStep,
  AgentPlanV2,
  AgentProgressEvent,
  AgentRunRecord,
  AgentRunState,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolResultV2,
} from './protocol';

