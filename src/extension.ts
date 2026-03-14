import * as vscode from "vscode";
import * as path from "path";
import { SaveWatcher } from "./watcher";
import { stageAll, getStagedDiff, commit, getRepoRoot } from "./gitHelper";
import { generateCommitMessage, CommitStyle } from "./commitGenerator";

let watcher: SaveWatcher | undefined;
let statusBar: vscode.StatusBarItem;
let extensionSecrets: vscode.SecretStorage;

/** Pending status-reset timers — cleared on deactivate to avoid touching disposed statusBar. */
const errorTimeouts = new Set<ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  extensionSecrets = context.secrets;

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
      // Clear any pending debounce timers immediately
      watcher?.pause();
      statusBar.text = "$(circle-slash) Smart Commit: off";
      vscode.window.showInformationMessage("Smart Commit: disabled.");
    }),

    vscode.commands.registerCommand("smartCommit.commitNow", async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders?.length) {
        vscode.window.showErrorMessage("Smart Commit: no workspace folder open.");
        return;
      }

      // Prefer the active editor's repo; fall back to the first workspace folder
      let repoRoot: string | null = null;
      const activeDoc = vscode.window.activeTextEditor?.document;
      if (activeDoc && activeDoc.uri.scheme === "file") {
        repoRoot = getRepoRoot(path.dirname(activeDoc.uri.fsPath));
      }
      if (!repoRoot) {
        repoRoot = getRepoRoot(folders[0].uri.fsPath) ?? folders[0].uri.fsPath;
      }

      await triggerCommit(repoRoot);
    }),

    // ---- Credential management commands ----

    vscode.commands.registerCommand("smartCommit.setGeminiApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Smart Commit: Set Gemini API Key",
        prompt: "Enter your Google Gemini API key",
        password: true,
        placeHolder: "AIza...",
        ignoreFocusOut: true,
      });
      if (key !== undefined) {
        await context.secrets.store("smartCommit.gemini.apiKey", key);
        vscode.window.showInformationMessage(
          key ? "Smart Commit: Gemini API key saved securely." : "Smart Commit: Gemini API key cleared."
        );
      }
    }),

    vscode.commands.registerCommand("smartCommit.setBedrockCredentials", async () => {
      const accessKeyId = await vscode.window.showInputBox({
        title: "Smart Commit: AWS Access Key ID",
        prompt: "Enter your AWS Access Key ID (leave blank to use IAM role / env vars)",
        password: false,
        placeHolder: "AKIA...",
        ignoreFocusOut: true,
      });
      if (accessKeyId === undefined) { return; }

      const secretAccessKey = await vscode.window.showInputBox({
        title: "Smart Commit: AWS Secret Access Key",
        prompt: "Enter your AWS Secret Access Key",
        password: true,
        ignoreFocusOut: true,
      });
      if (secretAccessKey === undefined) { return; }

      const sessionToken = await vscode.window.showInputBox({
        title: "Smart Commit: AWS Session Token (optional)",
        prompt: "Enter your AWS Session Token, or leave blank if not using temporary credentials",
        password: true,
        ignoreFocusOut: true,
      });
      if (sessionToken === undefined) { return; }

      await Promise.all([
        context.secrets.store("smartCommit.bedrock.accessKeyId", accessKeyId),
        context.secrets.store("smartCommit.bedrock.secretAccessKey", secretAccessKey),
        context.secrets.store("smartCommit.bedrock.sessionToken", sessionToken),
      ]);
      vscode.window.showInformationMessage("Smart Commit: AWS credentials saved securely.");
    }),

    vscode.commands.registerCommand("smartCommit.clearSecrets", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all Smart Commit stored credentials (API keys, AWS credentials)?",
        { modal: true },
        "Clear"
      );
      if (confirm !== "Clear") { return; }
      await Promise.all([
        context.secrets.delete("smartCommit.gemini.apiKey"),
        context.secrets.delete("smartCommit.bedrock.accessKeyId"),
        context.secrets.delete("smartCommit.bedrock.secretAccessKey"),
        context.secrets.delete("smartCommit.bedrock.sessionToken"),
      ]);
      vscode.window.showInformationMessage("Smart Commit: all stored credentials cleared.");
    })
  );
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

export function deactivate(): void {
  // Cancel pending status-reset timers so they don't fire on a disposed statusBar
  for (const id of errorTimeouts) {
    clearTimeout(id);
  }
  errorTimeouts.clear();
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
    const message = await generateCommitMessage(diff, style, extensionSecrets);

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

    // Reset status bar after a delay — track the timer to avoid touching a disposed bar
    const id = setTimeout(() => {
      errorTimeouts.delete(id);
      setStatusIdle();
    }, 6000);
    errorTimeouts.add(id);
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
