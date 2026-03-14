import * as vscode from "vscode";
import { createProvider } from "./llm";

export type CommitStyle = "conventional" | "descriptive";

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

function conventionalPrompt(diff: string): string {
  return `You are an expert software engineer writing a git commit message.
Analyze the git diff below and produce a single commit message.

FORMAT — Conventional Commits:
  <type>(<optional scope>): <short imperative summary, max 72 chars>

  [optional bullet-point body — 2-3 lines max, only for non-trivial changes]

TYPES: feat | fix | refactor | perf | chore | docs | test | style | ci
RULES:
- Use imperative mood ("add", not "added" or "adds")
- Be specific — avoid "update files" or "make changes"
- Do NOT wrap the message in markdown code fences
- Return ONLY the commit message, nothing else

Git diff:
\`\`\`diff
${diff}
\`\`\``;
}

function descriptivePrompt(diff: string): string {
  return `You are an expert software engineer writing a git commit message.
Analyze the git diff below and produce a clear, descriptive commit message.

FORMAT:
  <short imperative summary line, max 72 chars>

  [optional bullet-point body — 2-3 lines max, only for non-trivial changes]

RULES:
- Use imperative mood ("add", not "added")
- Be specific about what changed and why
- Do NOT wrap the message in markdown code fences
- Return ONLY the commit message, nothing else

Git diff:
\`\`\`diff
${diff}
\`\`\``;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a smart commit message for the given staged diff.
 *
 * @param diff    Output of `git diff --cached`
 * @param style   "conventional" | "descriptive"
 * @param secrets VS Code Secret Storage (used to retrieve API keys)
 */
export async function generateCommitMessage(
  diff: string,
  style: CommitStyle,
  secrets: vscode.SecretStorage
): Promise<string> {
  if (!diff.trim()) {
    throw new Error("Diff is empty — nothing to commit.");
  }

  const prompt =
    style === "conventional"
      ? conventionalPrompt(diff)
      : descriptivePrompt(diff);

  const provider = await createProvider(secrets);
  const raw = await provider.complete(prompt);

  // Strip any markdown code fences the LLM may have added despite instructions
  let message = raw
    .replace(/^```[^\n]*\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  // --- Validate the generated commit message ---

  if (!message) {
    throw new Error("LLM returned an empty commit message.");
  }

  // Hard limit — a legitimate commit message is never this long
  if (message.length > 10_000) {
    throw new Error("Generated commit message exceeds 10 000 characters and was rejected.");
  }

  // Strip C0/C1 control characters (null bytes, escape sequences, etc.)
  // but keep normal whitespace: \t (0x09), \n (0x0A), \r (0x0D)
  message = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  if (!message.trim()) {
    throw new Error("Commit message contained only invalid characters after sanitization.");
  }

  return message;
}
