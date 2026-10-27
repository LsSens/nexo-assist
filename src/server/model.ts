export function resolveModel(): string | null {
  if (process.env.MASTRA_MODEL) return process.env.MASTRA_MODEL;
  if (process.env.OPENAI_API_KEY) return "openai/gpt-6.1-sol";
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google/gemini-3.8-flash";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic/claude-haiku-5-5";
  return null;
}

export function mastraEnabled(): boolean {
  const mode = process.env.AGENT_MODE ?? "auto";
  if (mode === "rules") return false;
  if (mode === "mastra") return true;
  return Boolean(resolveModel());
}
