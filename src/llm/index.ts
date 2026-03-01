import * as vscode from "vscode";
import { BedrockProvider } from "./bedrockProvider";
import { GeminiProvider } from "./geminiProvider";
import type { LLMProvider } from "./provider";

export type { LLMProvider } from "./provider";

/**
 * Factory — reads the current VS Code settings and returns the configured
 * LLM provider instance. Throws a descriptive error if required settings
 * (e.g. API key) are missing so the user sees an actionable message.
 */
export function createProvider(): LLMProvider {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  const providerName = cfg.get<string>("llmProvider", "gemini");

  switch (providerName) {
    case "bedrock": {
      return new BedrockProvider({
        region: cfg.get<string>("bedrock.region", "us-east-1"),
        modelId: cfg.get<string>(
          "bedrock.modelId",
          "anthropic.claude-3-5-sonnet-20241022-v2:0"
        ),
        accessKeyId: cfg.get<string>("bedrock.accessKeyId", ""),
        secretAccessKey: cfg.get<string>("bedrock.secretAccessKey", ""),
        sessionToken: cfg.get<string>("bedrock.sessionToken", ""),
      });
    }

    case "gemini": {
      const apiKey = cfg.get<string>("gemini.apiKey", "");
      if (!apiKey) {
        throw new Error(
          'Gemini API key not configured.\n' +
          'Add "smartCommit.gemini.apiKey" to your VS Code settings.\n' +
          'Get a key at https://aistudio.google.com/apikey'
        );
      }
      return new GeminiProvider({
        apiKey,
        modelId: cfg.get<string>("gemini.modelId", "gemini-2.0-flash"),
      });
    }

    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}". ` +
        'Set smartCommit.llmProvider to "bedrock" or "gemini".'
      );
  }
}
