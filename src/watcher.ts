import * as vscode from "vscode";
import * as path from "path";
import { getRepoRoot, hasChanges } from "./gitHelper";

/** Called when debounce settles — receives the resolved git repo root. */
export type CommitCallback = (repoRoot: string) => Promise<void>;

/**
 * Listens to every file-save event and debounces per git repository.
 * Multiple saves in the same repo within `debounceSeconds` only trigger
 * one commit, fired after the last save.
 */
export class SaveWatcher implements vscode.Disposable {
  /** repoRoot → pending debounce timer */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
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
      if (hasChanges(repoRoot)) {
        await this.onCommit(repoRoot);
      }
    }, debounceMs);

    this.timers.set(repoRoot, timer);
  }

  dispose(): void {
    this.listener.dispose();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
