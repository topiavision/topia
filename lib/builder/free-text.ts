/* Shared free-text utilities for the builder bots — the parsing more than
 * one flow needs. Pure, dependency-free, deterministic; asserted by
 * scripts/check-builder.ts. Flow-specific grammar lives with each flow
 * (lib/builder/world.ts, project.ts); roadmap keeps its own engine. */

/** Trim, prefix https:// when protocol-less, validate. New input only —
 * legacy protocol-less rows in the DB are read-tolerated elsewhere. */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t) || !t.includes('.')) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Pull the first URL out of a sentence; returns the remainder for further
 * parsing. Matches explicit protocols and bare domains with a path-ish tail. */
export function extractFirstUrl(text: string): { url: string; rest: string } | null {
  const m = text.match(/\bhttps?:\/\/[^\s"'<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>]*)?/i);
  if (!m) return null;
  const url = normalizeUrl(m[0].replace(/[),.;!?]+$/, ''));
  if (!url) return null;
  return { url, rest: (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim() };
}

/** Video-host URLs belong in videoUrl; everything else is the project link. */
export function classifyMediaUrl(url: string): 'video' | 'link' {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return /(^|\.)?(youtube\.com|youtu\.be|vimeo\.com|instagram\.com|tiktok\.com)$/.test(host) ? 'video' : 'link';
  } catch {
    return 'link';
  }
}

/** "called X" / 'a zine, "Field Notes"' → the name. Copy of the roadmap
 * extractor's shape (roadmap keeps its own — don't couple the engines). */
export function extractQuotedName(text: string): string | null {
  let m = text.match(/(?:called|named|titled)\s+["'“”]?([^"'“”,.\n]+)["'“”]?/i);
  if (m) return m[1].trim().slice(0, 80) || null;
  m = text.match(/["“]([^"”]{2,80})["”]/);
  if (m) return m[1].trim() || null;
  return null;
}

/** "Maya did design, Jo produced and Sam was on camera" →
 * [{name:'Maya', role:'design'}, {name:'Jo', role:'produced'}, …].
 * Local fallback for the credits sentence when the LLM isn't configured. */
export function parseNameRoles(text: string): { name: string; role: string | null }[] {
  const out: { name: string; role: string | null }[] = [];
  const parts = text.split(/,|\band\b|;/i).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    // "X did Y" / "X was on Y" / "X handled Y" / "X on Y"
    let m = part.match(/^(.{2,40}?)\s+(?:did|was on|handled|on|does)\s+(?:the\s+)?(.+)$/i);
    if (m) { out.push({ name: m[1].trim(), role: m[2].trim().slice(0, 80) }); continue; }
    // "X — Y" / "X: Y" / "X (Y)"
    m = part.match(/^(.{2,40}?)\s*[—:-]\s*(.+)$/) ?? part.match(/^(.{2,40}?)\s*\((.+)\)$/);
    if (m) { out.push({ name: m[1].trim(), role: m[2].trim().replace(/\)$/, '').slice(0, 80) }); continue; }
    // "X produced" / "X mixed it" — trailing verb phrase
    m = part.match(/^(\S+(?:\s+\S+)?)\s+((?:co-)?(?:produced|mixed|mastered|shot|edited|designed|directed|wrote|filmed|styled|engineered)\b.*)$/i);
    if (m) { out.push({ name: m[1].trim(), role: m[2].trim().slice(0, 80) }); continue; }
    // Bare name
    if (/^[\p{L}][\p{L}\s.'-]{1,40}$/u.test(part)) out.push({ name: part, role: null });
  }
  return out.slice(0, 10);
}

/** "risograph, print culture and zines" → ['risograph', 'print culture', 'zines'] */
export function splitList(text: string): string[] {
  return text
    .split(/,|\band\b|;|\n/i)
    .map((t) => t.trim().replace(/^[#•-]\s*/, ''))
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 12);
}
