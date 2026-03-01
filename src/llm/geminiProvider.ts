import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider } from "./provider";

export interface GeminiConfig {
  apiKey: string;
  modelId: string;
}

export class GeminiProvider implements LLMProvider {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelId: string;

  constructor(config: GeminiConfig) {
    if (!config.apiKey) {
      throw new Error(
        "Gemini API key is missing. Set smartCommit.gemini.apiKey in your VS Code settings."
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

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (!text) {
      throw new Error("Google Gemini returned an empty response.");
    }

    return text;
  }
}
