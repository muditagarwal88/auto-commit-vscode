import * as vscode from "vscode";
import { SaveWatcher } from "./watcher";
import { stageAll, getStagedDiff, commit, hasChanges, getRepoRoot } from "./gitHelper";
import { generateCommitMessage, CommitStyle } from "./commitGenerator";

let watcher: SaveWatcher | undefined;
let statusBar: vscode.StatusBarItem;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Status bar item — bottom-left, always visible when extension is active
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  setStatusIdle();
  statusBar.tooltip = "Smart Commit — click to commit now";
  statusBar.command = "smartCommit.commitNow";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // File-save watcher — the core of the extension
  watcher = new SaveWatcher(triggerCommit);
  context.subscriptions.push(watcher);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("smartCommit.enable", () => {
      vscode.workspace
        .getConfiguration("smartCommit")
        .update("enabled", true, vscode.ConfigurationTarget.Global);
      setStatusIdle();
      vscode.window.showInformationMessage("Smart Commit: enabled.");
    }),

    vscode.commands.registerCommand("smartCommit.disable", () => {
      vscode.workspace
        .getConfiguration("smartCommit")
        .update("enabled", false, vscode.ConfigurationTarget.Global);
      statusBar.text = "$(circle-slash) Smart Commit: off";
      vscode.window.showInformationMessage("Smart Commit: disabled.");
    }),

    vscode.commands.registerCommand("smartCommit.commitNow", async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders?.length) {
        vscode.window.showErrorMessage("Smart Commit: no workspace folder open.");
        return;
      }

      // Use the first workspace folder; for multi-root workspaces the user can
      // trigger a save in the desired folder to let the debouncer pick it up.
      const repoRoot =
        getRepoRoot(folders[0].uri.fsPath) ?? folders[0].uri.fsPath;

      await triggerCommit(repoRoot);
    })
  );
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

export function deactivate(): void {
  watcher?.dispose();
}

// ---------------------------------------------------------------------------
// Core commit flow
// ---------------------------------------------------------------------------

async function triggerCommit(repoRoot: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  const style = cfg.get<CommitStyle>("commitStyle", "conventional");

  try {
    // 1. Stage everything if configured to do so
    if (cfg.get<boolean>("autoStageAll", true)) {
      statusBar.text = "$(loading~spin) Smart Commit: staging…";
      stageAll(repoRoot);
    }

    // 2. Bail out if there's nothing staged
    const diff = getStagedDiff(repoRoot);
    if (!diff.trim()) {
      setStatusIdle();
      return;
    }

    // 3. Generate commit message via LLM
    statusBar.text = "$(loading~spin) Smart Commit: generating message…";
    const message = await generateCommitMessage(diff, style);

    // 4. Commit
    statusBar.text = "$(loading~spin) Smart Commit: committing…";
    commit(repoRoot, message);

    // 5. Surface result
    const summary = message.split("\n")[0];
    vscode.window.setStatusBarMessage(`$(check) Smart Commit: ${summary}`, 6000);
    setStatusIdle();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    statusBar.text = "$(error) Smart Commit: error";
    vscode.window
      .showErrorMessage(`Smart Commit failed: ${msg}`, "Open Settings")
      .then((choice) => {
        if (choice === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "smartCommit"
          );
        }
      });
    // Reset status bar after a delay
    setTimeout(setStatusIdle, 6000);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatusIdle(): void {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  const on = cfg.get<boolean>("enabled", true);
  statusBar.text = on
    ? "$(git-commit) Smart Commit: on"
    : "$(circle-slash) Smart Commit: off";
}
