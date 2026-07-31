import {
  agentToolCallSchema,
  validateAgentToolResult,
  type AgentToolCall,
  type AgentToolDefinition,
  type AgentToolResultV2,
} from './protocol';

export class ToolRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRegistrationError';
  }
}

export class ToolValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ToolValidationError';
  }
}

export interface AgentToolRegistry {
  register(definition: AgentToolDefinition): void;
  get(toolId: string): AgentToolDefinition | null;
  list(): AgentToolDefinition[];
  getPlannerCatalog(): Array<Omit<AgentToolDefinition, 'handler' | 'inputSchema' | 'outputSchema'> & {
    inputShape: string;
    outputShape: string;
  }>;
  prepareCall(toolId: string, input: unknown, context: { runId: string; stepId: string }): AgentToolCall;
  validateResult(toolId: string, result: unknown): AgentToolResultV2;
}

const riskLevels = new Set(['read', 'create', 'update', 'delete']);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isSchema = (value: unknown): value is { parse: (input: unknown) => unknown } =>
  typeof value === 'object' && value !== null && typeof (value as { parse?: unknown }).parse === 'function';

const schemaShape = (schema: { constructor: { name?: string } }): string =>
  schema.constructor.name || 'schema';

const assertValidDefinition = (definition: AgentToolDefinition): void => {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    throw new ToolRegistrationError('Tool definition must be an object.');
  }
  const candidate = definition as unknown as Record<string, unknown>;
  const requiredStrings = ['id', 'title', 'description', 'category'];
  const missing = requiredStrings.find((field) => !isNonEmptyString(candidate[field]));

  if (missing) {
    throw new ToolRegistrationError(`Tool definition requires a non-empty ${missing}.`);
  }
  if (!Number.isInteger(candidate.version) || (candidate.version as number) <= 0) {
    throw new ToolRegistrationError('Tool definition requires a positive integer version.');
  }
  if (!riskLevels.has(candidate.riskLevel as string)) {
    throw new ToolRegistrationError('Tool definition has an invalid riskLevel.');
  }
  if (!isSchema(candidate.inputSchema) || !isSchema(candidate.outputSchema)) {
    throw new ToolRegistrationError('Tool definition requires inputSchema and outputSchema.');
  }
  if (!Number.isFinite(candidate.timeoutMs) || (candidate.timeoutMs as number) <= 0) {
    throw new ToolRegistrationError('Tool definition requires a positive timeoutMs.');
  }
  if (!Number.isInteger(candidate.maxRetries) || (candidate.maxRetries as number) < 0) {
    throw new ToolRegistrationError('Tool definition requires a non-negative integer maxRetries.');
  }
  if (typeof candidate.idempotent !== 'boolean' || typeof candidate.supportsAbort !== 'boolean') {
    throw new ToolRegistrationError('Tool definition requires boolean idempotent and supportsAbort metadata.');
  }
  if (typeof candidate.handler !== 'function') {
    throw new ToolRegistrationError('Tool definition requires a handler.');
  }
};

export const createAgentToolRegistry = (initialDefinitions: AgentToolDefinition[] = []): AgentToolRegistry => {
  const definitions = new Map<string, AgentToolDefinition>();

  const requireDefinition = (toolId: string): AgentToolDefinition => {
    const definition = definitions.get(toolId);
    if (!definition) {
      throw new ToolValidationError(`Unknown tool: ${toolId}`);
    }
    return definition;
  };

  const registry: AgentToolRegistry = {
    register(definition) {
      assertValidDefinition(definition);
      if (definitions.has(definition.id)) {
        throw new ToolRegistrationError(`Tool is already registered: ${definition.id}`);
      }

      definitions.set(definition.id, Object.freeze({ ...definition }));
    },

    get(toolId) {
      return definitions.get(toolId) ?? null;
    },

    list() {
      return [...definitions.values()];
    },

    getPlannerCatalog() {
      return [...definitions.values()].map(({ handler, inputSchema, outputSchema, ...metadata }) => ({
        ...metadata,
        inputShape: schemaShape(inputSchema),
        outputShape: schemaShape(outputSchema),
      }));
    },

    prepareCall(toolId, input, context) {
      const definition = requireDefinition(toolId);
      try {
        const validatedInput = definition.inputSchema.parse(input);
        return agentToolCallSchema.parse({ ...context, toolId, input: validatedInput });
      } catch (error) {
        throw new ToolValidationError(`Invalid input for tool: ${toolId}`, { cause: error });
      }
    },

    validateResult(toolId, result) {
      const definition = requireDefinition(toolId);
      try {
        return validateAgentToolResult(definition, result);
      } catch (error) {
        throw new ToolValidationError(`Invalid result for tool: ${toolId}`, { cause: error });
      }
    },
  };

  initialDefinitions.forEach((definition) => registry.register(definition));
  return registry;
};
