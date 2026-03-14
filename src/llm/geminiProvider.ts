import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider } from "./provider";

export interface GeminiConfig {
  apiKey: string;
  modelId: string;
}

const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

export class GeminiProvider implements LLMProvider {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelId: string;

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error(
        "Gemini API key is missing. Run \"Smart Commit: Set Gemini API Key\" to store it securely."
      );
    }
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.modelId = config.modelId;
  }

  async complete(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelId,
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.2,
      },
    });

    // Race the API call against a timeout so a hung connection never blocks
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Gemini API request timed out (30s). Please try again.")),
        REQUEST_TIMEOUT_MS
      )
    );

    const result = await Promise.race([
      model.generateContent(prompt),
      timeoutPromise,
    ]);

    const text = result.response.text().trim();

    if (!text) {
      throw new Error("Google Gemini returned an empty response.");
    }

    return text;
  }
}
