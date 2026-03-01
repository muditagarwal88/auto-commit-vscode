/**
 * Abstract contract for every LLM provider.
 * Each provider receives a fully-formed prompt string and returns the
 * raw completion text. Prompt construction lives in commitGenerator.ts.
 */
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}
