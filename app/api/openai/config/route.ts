import { NextResponse } from "next/server";
import { getOpenAIConfig, DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_REASONING_EFFORT, DEFAULT_VERBOSITY } from "../utils";

/**
 * Get OpenAI configuration (for client-side access)
 * All settings come from environment variables
 */
export async function GET() {
  try {
    const config = getOpenAIConfig();

    if (!config) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Read optional settings from env vars, use defaults if not set
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
    const temperature = process.env.OPENAI_TEMPERATURE
      ? parseFloat(process.env.OPENAI_TEMPERATURE)
      : DEFAULT_TEMPERATURE;
    const reasoningEffort = (process.env.OPENAI_REASONING_EFFORT as "none" | "low" | "medium" | "high") || DEFAULT_REASONING_EFFORT;
    const verbosity = (process.env.OPENAI_VERBOSITY as "low" | "medium" | "high") || DEFAULT_VERBOSITY;

    return NextResponse.json({
      success: true,
      assistantId: config.assistantId || null,
      model,
      temperature,
      reasoningEffort,
      verbosity,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get config" },
      { status: 500 }
    );
  }
}

