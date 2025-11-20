import OpenAI from "openai";
import { COMPOSABLE_WRITER_INSTRUCTIONS } from "../../utils/toneInstructions";

/**
 * Get OpenAI API configuration from environment variables
 */
export function getOpenAIConfig(): { apiKey: string; organizationId?: string; assistantId?: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const organizationId = process.env.OPENAI_ORG_ID;
  const assistantId = process.env.OPENAI_ASSISTANT_ID;

  if (!apiKey) {
    return null;
  }

  return { apiKey, organizationId, assistantId };
}

/**
 * Create OpenAI client instance
 */
export function createOpenAIClient(): OpenAI {
  const config = getOpenAIConfig();

  if (!config) {
    throw new Error("OpenAI API key not configured. Please set OPENAI_API_KEY in .env.local");
  }

  const clientConfig: { apiKey: string; organization?: string } = {
    apiKey: config.apiKey,
  };

  if (config.organizationId) {
    clientConfig.organization = config.organizationId;
  }

  return new OpenAI(clientConfig);
}

/**
 * Build system prompt with unified Composable Writer instructions
 * @param customInstructions - Custom instructions (optional, uses default if not provided)
 */
export function buildSystemPrompt(
  customInstructions?: string
): string {
  // Important: Do not include reasoning or thinking process in your output
  const noReasoningInstruction = "CRITICAL: You are The Composable Writer. Provide ONLY your final output. Never include your reasoning process, thinking steps, internal thoughts, or meta-commentary. Only provide the actual content requested.\n\n";

  // Use provided instructions, or fall back to default unified instructions
  const instructions = customInstructions?.trim() || COMPOSABLE_WRITER_INSTRUCTIONS;

  return `${noReasoningInstruction}${instructions}

Remember: Always follow these guidelines. Provide only the final output, never your reasoning process.`;
}

/**
 * Default model configuration
 */
export const DEFAULT_MODEL = "gpt-5.1";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 4000; // Higher default for GPT-5.1, can be removed from UI
export const DEFAULT_REASONING_EFFORT = "none"; // GPT-5.1 default: none (lowest latency)
export const DEFAULT_VERBOSITY = "medium"; // GPT-5.1 default: medium

/**
 * Available models
 */
export const AVAILABLE_MODELS = [
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
] as const;

