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
 * Credentials (API keys, AWS credentials) are read from VS Code's encrypted
 * Secret Storage, NOT from plain-text settings. Use the extension commands
 * "Smart Commit: Set Gemini API Key" and "Smart Commit: Set AWS Credentials"
 * to store them securely.
 *
 * Provider priority:
 *  1. "vscode"  (default) — uses the editor's built-in LM API, no credentials needed.
 *  2. "gemini"            — Google Gemini API, requires an API key in Secret Storage.
 *  3. "bedrock"           — AWS Bedrock, requires AWS credentials in Secret Storage
 *                           (or IAM role / environment variables).
 */
export async function createProvider(secrets: vscode.SecretStorage): Promise<LLMProvider> {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  const providerName = cfg.get<string>("llmProvider", "vscode");

  switch (providerName) {
    case "vscode": {
      const modelFamily = cfg.get<string>("vscode.modelFamily", "").trim();
      return new VscodeLMProvider(modelFamily || undefined);
    }

    case "gemini": {
      const apiKey = (await secrets.get("smartCommit.gemini.apiKey"))?.trim() ?? "";
      if (!apiKey) {
        throw new Error(
          "Gemini API key not configured.\n" +
            "Run the command \"Smart Commit: Set Gemini API Key\" to store it securely,\n" +
            "or switch \"smartCommit.llmProvider\" back to \"vscode\" to use the editor's\n" +
            "built-in model instead."
        );
      }
      return new GeminiProvider({
        apiKey,
        modelId: cfg.get<string>("gemini.modelId", "gemini-2.0-flash"),
      });
    }

    case "bedrock": {
      const [accessKeyId, secretAccessKey, sessionToken] = await Promise.all([
        secrets.get("smartCommit.bedrock.accessKeyId"),
        secrets.get("smartCommit.bedrock.secretAccessKey"),
        secrets.get("smartCommit.bedrock.sessionToken"),
      ]);
      return new BedrockProvider({
        region: cfg.get<string>("bedrock.region", "us-east-1"),
        modelId: cfg.get<string>(
          "bedrock.modelId",
          "anthropic.claude-3-5-sonnet-20241022-v2:0"
        ),
        accessKeyId: accessKeyId ?? "",
        secretAccessKey: secretAccessKey ?? "",
        sessionToken: sessionToken ?? "",
      });
    }

    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}".\n` +
          'Set "smartCommit.llmProvider" to "vscode", "gemini", or "bedrock".'
      );
  }
}
