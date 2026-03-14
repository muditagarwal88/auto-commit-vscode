# Smart Commit

AI-powered automatic git commits. Every time you save a file, Smart Commit waits for a configurable idle period, then stages your changes and generates a meaningful commit message using an AI model — all without leaving your editor.

## Features

- **Auto-commit on save** — commits fire automatically after a configurable debounce (default 45 s)
- **Smart messages** — Conventional Commits or plain descriptive format
- **Zero-setup default** — uses the built-in LM API of your editor (Cursor, Anti-Gravity, VS Code + Copilot)
- **Optional external providers** — Google Gemini or AWS Bedrock for standalone VS Code installs
- **Manual trigger** — click the status bar item or run `Smart Commit: Commit Now`

## Setup

### Default (VS Code built-in model)

No configuration needed. Smart Commit uses whatever model your editor provides:
- **Cursor / Anti-Gravity** — uses the AI already signed in
- **VS Code + GitHub Copilot** — uses Copilot's models

### Google Gemini

1. Set `"smartCommit.llmProvider": "gemini"` in your settings
2. Run the command **Smart Commit: Set Gemini API Key** — your key is stored in the OS keychain, not in `settings.json`

### AWS Bedrock

1. Set `"smartCommit.llmProvider": "bedrock"` in your settings
2. Run the command **Smart Commit: Set AWS Bedrock Credentials** — credentials are stored in the OS keychain
3. Alternatively, leave credentials blank and use an IAM role, `AWS_*` environment variables, or `~/.aws/credentials`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `smartCommit.enabled` | `true` | Enable/disable auto-commit |
| `smartCommit.debounceSeconds` | `45` | Idle seconds after last save before committing (10–3600) |
| `smartCommit.autoStageAll` | `true` | Run `git add -A` before committing |
| `smartCommit.commitStyle` | `conventional` | `conventional` or `descriptive` |
| `smartCommit.llmProvider` | `vscode` | `vscode`, `gemini`, or `bedrock` |
| `smartCommit.vscode.modelFamily` | _(any)_ | Preferred model family for VS Code LM provider |
| `smartCommit.gemini.modelId` | `gemini-2.0-flash` | Gemini model ID |
| `smartCommit.bedrock.region` | `us-east-1` | AWS region |
| `smartCommit.bedrock.modelId` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Bedrock model ID |

## Commands

| Command | Description |
|---------|-------------|
| `Smart Commit: Enable` | Enable auto-commit |
| `Smart Commit: Disable` | Disable auto-commit |
| `Smart Commit: Commit Now` | Immediately commit the active repo |
| `Smart Commit: Set Gemini API Key` | Securely store your Gemini API key |
| `Smart Commit: Set AWS Bedrock Credentials` | Securely store your AWS credentials |
| `Smart Commit: Clear All Stored Credentials` | Remove all stored secrets from the OS keychain |

## Privacy & Data Disclosure

**Your code is sent to an AI provider to generate commit messages.** Please read the following before use:

### What data is transmitted

- The **staged git diff** (up to 6 000 characters) is sent to the configured LLM provider on every commit.
- This diff contains the actual lines of code you changed.

### Where it goes

| Provider | Data goes to | Privacy policy |
|----------|-------------|----------------|
| VS Code LM API (`vscode`) | Depends on editor — Cursor, Anti-Gravity, or GitHub Copilot | Governed by your editor's terms |
| Google Gemini (`gemini`) | Google's servers | [Google AI Terms of Service](https://ai.google.dev/terms) |
| AWS Bedrock (`bedrock`) | AWS in your configured region | [AWS Privacy Notice](https://aws.amazon.com/privacy/) |

### Credential security

- API keys and AWS credentials are stored in **VS Code's encrypted Secret Storage** (backed by the OS keychain on macOS/Windows), never in plain-text `settings.json`.
- No credentials or diff content are logged to disk by this extension.

### Recommendations

- **Do not use this extension on repositories containing secrets** (API keys, passwords, private keys) unless you have reviewed your diff contents before committing.
- Consider using IAM roles or environment variables for AWS Bedrock instead of explicit credentials.
- If your company has data-residency requirements, use the `bedrock` provider with a region in your approved geography.

## License

MIT
