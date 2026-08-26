// infra/lambda/shared/aiAdapter.ts
//
// Answers the "we don't want to pay for client AI usage" concern the same way
// ErpAdapter answers "we don't want to hand-build a thousand integrations":
// one small interface, swappable implementation, credentials resolved per
// tenant. Here the "credential" is the tenant's own provider API key (BYOK),
// not a platform-wide one - the platform never sees a token it has to pay for.

export interface AiAdapter {
  complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

interface AnthropicAiAdapterConfig {
  apiKey: string;
  model?: string;
}

export class AnthropicAiAdapter implements AiAdapter {
  constructor(private readonly config: AnthropicAiAdapterConfig) {}

  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model ?? 'claude-sonnet-4-6',
        max_tokens: options?.maxTokens ?? 256,
        temperature: options?.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI adapter: Anthropic API returned ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const textBlock = json.content.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  }
}
