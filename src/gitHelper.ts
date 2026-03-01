import { execSync, ExecSyncOptions } from "child_process";

const EXEC_OPTS: ExecSyncOptions = {
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
};

function git(repoPath: string, args: string): string {
  // Use -C to run in the repo directory without cd
  return (
    execSync(`git -C "${repoPath}" ${args}`, EXEC_OPTS) as string
  ).trim();
}

/** True if there are any staged or unstaged changes in the repo. */
export function hasChanges(repoPath: string): boolean {
  try {
    return git(repoPath, "status --porcelain").length > 0;
  } catch {
    return false;
  }
}

/** Stage all changes (git add -A). */
export function stageAll(repoPath: string): void {
  git(repoPath, "add -A");
}

/**
 * Returns the unified diff of staged changes, capped at ~6 000 characters
 * to stay within a reasonable LLM context window.
 */
export function getStagedDiff(repoPath: string): string {
  try {
    const diff = git(repoPath, "diff --cached --unified=3");
    const MAX = 6000;
    return diff.length > MAX
      ? diff.slice(0, MAX) + "\n\n... (diff truncated for LLM context)"
      : diff;
  } catch {
    return "";
  }
}

/**
 * Commit with the given message.
 * The message is passed via stdin (-F -) to avoid any shell-injection risk.
 */
export function commit(repoPath: string, message: string): void {
  execSync(`git -C "${repoPath}" commit -F -`, {
    input: message,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Walk up from `dirPath` until we find a git repo root.
 * Returns the root path, or null if not in a git repo.
 */
export function getRepoRoot(dirPath: string): string | null {
  try {
    return git(dirPath, "rev-parse --show-toplevel");
  } catch {
    return null;
  }
}
