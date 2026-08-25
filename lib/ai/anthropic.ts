/* Anthropic client for the builder bots' free-text understanding.
 *
 * Degrades gracefully per house rule #6: isAnthropicConfigured() gates every
 * call, the client is constructed lazily (never at import), and
 * extractStructured never throws — the builders run chips-only when this is
 * unconfigured or failing. Configure via ANTHROPIC_API_KEY; override the
 * model with ANTHROPIC_MODEL (default claude-opus-5; claude-haiku-4-5 is the
 * cheap/fast option for these small extractions). */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodType } from 'zod';

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5';

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!isAnthropicConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type ExtractionResult =
  | { configured: false }
  | { configured: true; ok: false; reason: 'timeout' | 'api_error' | 'no_output' }
  | { configured: true; ok: true; raw: unknown };

/** One small structured-extraction call. The caller supplies the field
 * schema; the caller ALSO re-clamps the output — never trust `raw` alone. */
export async function extractStructured(opts: {
  system: string;
  text: string;
  schema: ZodType;
}): Promise<ExtractionResult> {
  const c = getClient();
  if (!c) return { configured: false };
  try {
    const response = await c.messages.parse(
      {
        model: ANTHROPIC_MODEL(),
        max_tokens: 1000,
        system: opts.system,
        messages: [{ role: 'user', content: opts.text }],
        output_config: {
          format: zodOutputFormat(opts.schema),
          effort: 'low',
        },
      },
      { timeout: 5000, maxRetries: 0 },
    );
    if (response.parsed_output == null) return { configured: true, ok: false, reason: 'no_output' };
    return { configured: true, ok: true, raw: response.parsed_output };
  } catch (error) {
    const isTimeout = error instanceof Anthropic.APIConnectionTimeoutError;
    console.error('[anthropic] extraction failed:', error instanceof Error ? error.message : error);
    return { configured: true, ok: false, reason: isTimeout ? 'timeout' : 'api_error' };
  }
}
