import * as vscode from "vscode";
import type { LLMProvider } from "./provider";

const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Uses the editor's built-in Language Model API (vscode.lm).
 *
 * Works out-of-the-box in:
 *  - Cursor          → uses the model the user is already signed into
 *  - Anti-Gravity    → uses Gemini (already authenticated via Google account)
 *  - VS Code         → uses GitHub Copilot models
 *
 * No API keys or credentials needed — the editor handles auth.
 *
 * Optionally filter to a preferred model family via
 * `smartCommit.vscode.modelFamily` (e.g. "gpt-4o", "gemini").
 * Leave empty to use whatever the editor has available.
 */
export class VscodeLMProvider implements LLMProvider {
  constructor(private readonly modelFamily?: string) {}

  async complete(prompt: string): Promise<string> {
    // Build selector — omit family if not specified so any model qualifies
    const selector: vscode.LanguageModelChatSelector = this.modelFamily
      ? { family: this.modelFamily }
      : {};

    const models = await vscode.lm.selectChatModels(selector);

    if (!models.length) {
      throw new Error(
        this.modelFamily
          ? `No language model matching family "${this.modelFamily}" is available.\n` +
            "Clear smartCommit.vscode.modelFamily to use any available model, " +
            "or switch to the Gemini / Bedrock provider in Smart Commit settings."
          : "No language model is available in this editor.\n" +
            "• VS Code: install the GitHub Copilot extension.\n" +
            "• Cursor / Anti-Gravity: make sure you are signed in.\n" +
            "Alternatively, switch to the Gemini or Bedrock provider in Smart Commit settings."
      );
    }

    const model = models[0];
    const cts = new vscode.CancellationTokenSource();

    // Auto-cancel if the model takes too long
    const timeoutId = setTimeout(() => cts.cancel(), REQUEST_TIMEOUT_MS);

    try {
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        cts.token
      );

      let text = "";
      for await (const chunk of response.text) {
        text += chunk;
      }

      if (!text.trim()) {
        throw new Error("The editor's language model returned an empty response.");
      }

      return text.trim();
    } finally {
      clearTimeout(timeoutId);
      cts.dispose();
    }
  }
}
