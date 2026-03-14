import * as vscode from "vscode";
import * as path from "path";
import { getRepoRoot, hasChanges } from "./gitHelper";

/** Called when debounce settles — receives the resolved git repo root. */
export type CommitCallback = (repoRoot: string) => Promise<void>;

/**
 * Listens to every file-save event and debounces per git repository.
 * Multiple saves in the same repo within `debounceSeconds` only trigger
 * one commit, fired after the last save.
 *
 * A per-repo in-progress lock prevents overlapping commits if the debounce
 * timer fires while a previous commit is still running.
 */
export class SaveWatcher implements vscode.Disposable {
  /** repoRoot → pending debounce timer */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** repoRoot → commit currently in flight */
  private readonly inProgress = new Set<string>();
  private readonly listener: vscode.Disposable;

  constructor(private readonly onCommit: CommitCallback) {
    this.listener = vscode.workspace.onDidSaveTextDocument(
      this.handleSave.bind(this)
    );
  }

  private handleSave(doc: vscode.TextDocument): void {
    const cfg = vscode.workspace.getConfiguration("smartCommit");
    if (!cfg.get<boolean>("enabled", true)) {
      return;
    }

    // Ignore output channels, git internals, etc.
    if (doc.uri.scheme !== "file") {
      return;
    }

    const repoRoot = getRepoRoot(path.dirname(doc.uri.fsPath));
    if (!repoRoot) {
      return; // Not inside a git repository
    }

    const debounceMs = cfg.get<number>("debounceSeconds", 45) * 1000;

    // Reset the timer for this repo on every save
    const existing = this.timers.get(repoRoot);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(repoRoot);

      // Skip if a commit for this repo is already running
      if (this.inProgress.has(repoRoot)) {
        return;
      }

      if (hasChanges(repoRoot)) {
        this.inProgress.add(repoRoot);
        try {
          await this.onCommit(repoRoot);
        } catch {
          // onCommit (triggerCommit in extension.ts) already catches errors
          // and surfaces them via the status bar + notification.
        } finally {
          this.inProgress.delete(repoRoot);
        }
      }
    }, debounceMs);

    this.timers.set(repoRoot, timer);
  }

  /**
   * Cancel all pending debounce timers without disposing the listener.
   * Called when the user disables the extension via command so in-flight
   * timers don't fire after the extension is turned off.
   */
  pause(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  dispose(): void {
    this.listener.dispose();
    this.pause();
  }
}
