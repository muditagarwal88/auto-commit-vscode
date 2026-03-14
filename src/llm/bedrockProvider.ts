import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { LLMProvider } from "./provider";

export interface BedrockConfig {
  region: string;
  modelId: string;
  /** Leave empty to fall back to IAM role / env vars / ~/.aws/credentials */
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Only needed for temporary STS credentials */
  sessionToken?: string;
}

const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

export class BedrockProvider implements LLMProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(config: BedrockConfig) {
    const hasExplicitCreds =
      config.accessKeyId && config.secretAccessKey;

    this.client = new BedrockRuntimeClient({
      region: config.region,
      ...(hasExplicitCreds
        ? {
            credentials: {
              accessKeyId: config.accessKeyId!,
              secretAccessKey: config.secretAccessKey!,
              ...(config.sessionToken
                ? { sessionToken: config.sessionToken }
                : {}),
            },
          }
        : {}),
    });

    this.modelId = config.modelId;
  }

  async complete(prompt: string): Promise<string> {
    // Race the AWS call against a timeout so a hung connection never blocks
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Bedrock API request timed out (30s). Please try again.")),
        REQUEST_TIMEOUT_MS
      )
    );

    const response = await Promise.race([
      this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: 300,
            temperature: 0.2,
          },
        })
      ),
      timeoutPromise,
    ]);

    const content = response.output?.message?.content ?? [];

    // ConverseCommand returns a union of block types; extract all text blocks
    // using an explicit type guard — no unsafe type assertions
    const text = content
      .map((block) =>
        "text" in block && typeof block.text === "string" ? block.text : ""
      )
      .join("")
      .trim();

    if (!text) {
      throw new Error("AWS Bedrock returned an empty response.");
    }

    return text;
  }
}
