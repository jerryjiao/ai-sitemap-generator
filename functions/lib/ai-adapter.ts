/**
 * Multi-model AI adapter for BYOK (Bring Your Own Key).
 *
 * Supports three provider types:
 *   - openai-compatible (also covers DeepSeek, SiliconFlow, Tongyi, Kimi, OpenRouter, etc.)
 *   - anthropic (Claude)
 *   - google (Gemini)
 *
 * All calls use native fetch() -- no external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProvider = 'openai-compatible' | 'anthropic' | 'google';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateConfig(config: AIConfig): void {
  if (!config.provider) {
    throw new Error('AI provider is required');
  }

  const validProviders: AIProvider[] = ['openai-compatible', 'anthropic', 'google'];
  if (!validProviders.includes(config.provider)) {
    throw new Error(
      `Unsupported AI provider: "${config.provider}". Must be one of: ${validProviders.join(', ')}`
    );
  }

  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
    throw new Error('API key is required and must be a non-empty string');
  }
}

function validatePrompt(prompt: string): void {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string');
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

async function callOpenAICompatible(config: AIConfig, prompt: string): Promise<string> {
  const baseUrl = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const model = config.model || 'gpt-4o-mini';
  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error body');
    throw new Error(
      `OpenAI-compatible API error (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`OpenAI-compatible API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenAI-compatible API returned an empty response');
  }

  return text;
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

async function callAnthropic(config: AIConfig, prompt: string): Promise<string> {
  const baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const model = config.model || 'claude-sonnet-4-20250514';
  const url = `${baseUrl}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error body');
    throw new Error(
      `Anthropic API error (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`Anthropic API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  // Anthropic returns content as an array of content blocks
  const textBlock = data.content?.find((block) => block.type === 'text');
  const text = textBlock?.text;
  if (!text) {
    throw new Error('Anthropic API returned an empty response');
  }

  return text;
}

// ---------------------------------------------------------------------------
// Google (Gemini) provider
// ---------------------------------------------------------------------------

async function callGoogle(config: AIConfig, prompt: string): Promise<string> {
  const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const model = config.model || 'gemini-2.0-flash';
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error body');
    throw new Error(
      `Google AI API error (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`Google AI API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Google AI API returned an empty response');
  }

  return text;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const providerHandlers: Record<AIProvider, (config: AIConfig, prompt: string) => Promise<string>> = {
  'openai-compatible': callOpenAICompatible,
  'anthropic': callAnthropic,
  'google': callGoogle,
};

export async function callAI(config: AIConfig, prompt: string): Promise<string> {
  validateConfig(config);
  validatePrompt(prompt);

  const handler = providerHandlers[config.provider];

  try {
    return await handler(config, prompt);
  } catch (error: unknown) {
    // Wrap unexpected errors while preserving original message for known ones
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unexpected AI adapter error: ${String(error)}`);
  }
}
