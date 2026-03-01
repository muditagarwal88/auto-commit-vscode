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
    const response = await this.client.send(
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
    );

    const content = response.output?.message?.content ?? [];

    // ConverseCommand returns a union of block types; extract all text blocks
    const text = content
      .map((block) => ("text" in block ? (block.text as string) : ""))
      .join("")
      .trim();

    if (!text) {
      throw new Error("AWS Bedrock returned an empty response.");
    }

    return text;
  }
}
