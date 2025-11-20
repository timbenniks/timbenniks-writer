export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toneInstructions?: string;
  reasoning?: {
    effort?: "none" | "low" | "medium" | "high";
  };
  text?: {
    verbosity?: "low" | "medium" | "high";
  };
}

export interface ChatResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  type: "chunk" | "done" | "error";
  content?: string;
  error?: string;
  finishReason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

