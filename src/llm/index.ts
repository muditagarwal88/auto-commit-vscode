import * as vscode from "vscode";
import { BedrockProvider } from "./bedrockProvider";
import { GeminiProvider } from "./geminiProvider";
import { VscodeLMProvider } from "./vscodeProvider";
import type { LLMProvider } from "./provider";

export type { LLMProvider } from "./provider";

/**
 * Factory — reads the current VS Code settings and returns the configured
 * LLM provider instance.
 *
 * Provider priority:
 *  1. "vscode"  (default) — uses the editor's built-in LM API, no credentials needed.
 *  2. "gemini"            — Google Gemini API, requires an API key.
 *  3. "bedrock"           — AWS Bedrock, requires AWS credentials.
 *
 * If the default "vscode" provider has no model available at commit time,
 * the error message guides the user to configure an alternative provider.
 */
export function createProvider(): LLMProvider {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  const providerName = cfg.get<string>("llmProvider", "vscode");

  switch (providerName) {
    case "vscode": {
      const modelFamily = cfg.get<string>("vscode.modelFamily", "").trim();
      return new VscodeLMProvider(modelFamily || undefined);
    }

    case "gemini": {
      const apiKey = cfg.get<string>("gemini.apiKey", "").trim();
      if (!apiKey) {
        throw new Error(
          "Gemini API key not configured.\n" +
            'Add "smartCommit.gemini.apiKey" to your settings, or switch\n' +
            '"smartCommit.llmProvider" back to "vscode" to use the editor\'s\n' +
            "built-in model instead."
        );
      }
      return new GeminiProvider({
        apiKey,
        modelId: cfg.get<string>("gemini.modelId", "gemini-2.0-flash"),
      });
    }

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

    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}".\n` +
          'Set "smartCommit.llmProvider" to "vscode", "gemini", or "bedrock".'
      );
  }
}
