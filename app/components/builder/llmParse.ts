'use client';

/* Client half of the hybrid brain: send an utterance to /api/builder/parse,
 * get clamped fields back, or null — and null ALWAYS means "use the local
 * fallback", never an error the user sees. Once the server says
 * unconfigured, the whole session skips the network and stays chips-only. */

let knownUnconfigured = false;

export async function llmParse(
  flow: 'world' | 'project' | 'event' | 'profile',
  text: string,
  privyId: string,
): Promise<Record<string, unknown> | null> {
  if (knownUnconfigured || !privyId) return null;
  try {
    const res = await fetch('/api/builder/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyId, flow, text }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.configured === false) { knownUnconfigured = true; return null; }
    if (!data?.ok || !data?.fields || typeof data.fields !== 'object') return null;
    return data.fields as Record<string, unknown>;
  } catch {
    return null;
  }
}
