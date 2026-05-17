/**
 * AI Settings API route (BYOK — Bring Your Own Key).
 *
 * GET    / — Get current AI settings (provider, baseUrl, model — never the key).
 * POST   / — Save or update AI settings (encrypts the API key before storage).
 * DELETE / — Remove AI settings from the database.
 */

import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';
import { encrypt } from '../lib/crypto';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

const ENCRYPTION_SECRET = 'ai-sitemap-encryption-key-v1';

const VALID_PROVIDERS = ['openai-compatible', 'anthropic', 'google'] as const;
type ValidProvider = (typeof VALID_PROVIDERS)[number];

/**
 * Validate that the provider string is one of the allowed values.
 */
function isValidProvider(value: string): value is ValidProvider {
  return VALID_PROVIDERS.includes(value as ValidProvider);
}

// ---------------------------------------------------------------------------
// GET / — Get current AI settings (without the encrypted key)
// ---------------------------------------------------------------------------

app.get('/', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT id, provider, base_url, model, created_at, updated_at FROM ai_configs ORDER BY updated_at DESC LIMIT 1')
    .first();

  if (!result) {
    return c.json({ configured: false, settings: null });
  }

  return c.json({
    configured: true,
    settings: {
      id: result.id,
      provider: result.provider,
      baseUrl: result.base_url,
      model: result.model,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    },
  });
});

// ---------------------------------------------------------------------------
// POST / — Save AI settings
// ---------------------------------------------------------------------------

app.post('/', async (c) => {
  let body: { provider?: string; apiKey?: string; baseUrl?: string; model?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }

  // Validate provider
  if (!body.provider || typeof body.provider !== 'string') {
    return c.json({ error: 'Provider is required and must be a string' }, 400);
  }

  if (!isValidProvider(body.provider)) {
    return c.json({ error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` }, 400);
  }

  // Validate API key
  if (!body.apiKey || typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
    return c.json({ error: 'API key is required and must be a non-empty string' }, 400);
  }

  // Validate optional base URL
  if (body.baseUrl !== undefined && body.baseUrl !== null) {
    if (typeof body.baseUrl !== 'string') {
      return c.json({ error: 'Base URL must be a string' }, 400);
    }
    try {
      new URL(body.baseUrl);
    } catch {
      return c.json({ error: 'Base URL is not a valid URL' }, 400);
    }
  }

  // Validate optional model name
  if (body.model !== undefined && body.model !== null) {
    if (typeof body.model !== 'string' || body.model.trim().length === 0) {
      return c.json({ error: 'Model must be a non-empty string when provided' }, 400);
    }
  }

  // Encrypt the API key
  const encryptedKey = await encrypt(body.apiKey.trim(), ENCRYPTION_SECRET);

  // Check if a config already exists — update or insert
  const existing = await c.env.DB
    .prepare('SELECT id FROM ai_configs ORDER BY updated_at DESC LIMIT 1')
    .first();

  if (existing) {
    // Update existing config
    await c.env.DB.prepare(
      `UPDATE ai_configs
       SET provider = ?, encrypted_key = ?, base_url = ?, model = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      body.provider,
      encryptedKey,
      body.baseUrl?.trim() || null,
      body.model?.trim() || null,
      existing.id
    ).run();
  } else {
    // Insert new config
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO ai_configs (id, provider, encrypted_key, base_url, model)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.provider,
      encryptedKey,
      body.baseUrl?.trim() || null,
      body.model?.trim() || null
    ).run();
  }

  return c.json({
    success: true,
    message: 'AI settings saved successfully',
    settings: {
      provider: body.provider,
      baseUrl: body.baseUrl?.trim() || null,
      model: body.model?.trim() || null,
    },
  });
});

// ---------------------------------------------------------------------------
// DELETE / — Remove AI settings
// ---------------------------------------------------------------------------

app.delete('/', async (c) => {
  const result = await c.env.DB
    .prepare('DELETE FROM ai_configs')
    .run();

  const deleted = result.meta?.changes ?? 0;

  return c.json({
    success: true,
    message: deleted > 0 ? 'AI settings removed' : 'No AI settings found to remove',
  });
});

export default app;
