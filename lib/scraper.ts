import * as cheerio from 'cheerio';

export class ScraperError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface ScrapedGrant {
  grantName: string | null;
  orgName: string | null;
  shortDescription: string | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: string;
  deadlineType: string | null;
  deadlineDate: string | null;
  link: string;
  region: string | null;
  source: string;
}

interface ScrapedResult {
  grant: ScrapedGrant;
  warnings: string[];
}

// Block private/internal IPs to prevent SSRF
function isPrivateHost(hostname: string): boolean {
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^\[::1\]$/,
    /^169\.254\./,
  ];
  return blocked.some((r) => r.test(hostname));
}

// Clean trailing site name from title (e.g. "Grant Name | LACMA" → "Grant Name")
// Only strips if the trailing part looks like a short site/org name (no digits, under 30 chars)
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[|]\s*[^|]+$/, '') // Always strip pipe-separated suffixes
    .replace(/\s+[-–—]\s+(?=[A-Z][^0-9]{0,28}$)/, '\x00') // Mark dash-separated suffix only if short and no digits
    .replace(/\x00.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract dollar/euro/pound amounts from text
function extractAmounts(text: string): { min: number | null; max: number | null; currency: string } {
  const currencyMap: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
  let currency = 'USD';

  // Match patterns like "$1,000 - $50,000", "€500 to €5,000", "up to $10,000"
  const rangePattern = /([€£$])\s*([\d,]+(?:\.\d+)?)\s*(?:[-–—to]+)\s*[€£$]?\s*([\d,]+(?:\.\d+)?)/gi;
  const rangeMatch = rangePattern.exec(text);
  if (rangeMatch) {
    currency = currencyMap[rangeMatch[1]] || 'USD';
    const a = parseInt(rangeMatch[2].replace(/[,\.]/g, ''), 10);
    const b = parseInt(rangeMatch[3].replace(/[,\.]/g, ''), 10);
    return { min: Math.min(a, b), max: Math.max(a, b), currency };
  }

  // Match "up to $X" or "maximum of $X"
  const upToPattern = /(?:up\s+to|maximum\s+(?:of\s+)?|max\.?\s+)([€£$])\s*([\d,]+(?:\.\d+)?)/gi;
  const upToMatch = upToPattern.exec(text);
  if (upToMatch) {
    currency = currencyMap[upToMatch[1]] || 'USD';
    return { min: null, max: parseInt(upToMatch[2].replace(/[,\.]/g, ''), 10), currency };
  }

  // Match single amounts like "$50,000" near grant-related keywords
  const singlePattern = /([€£$])\s*([\d,]{3,}(?:\.\d+)?)/g;
  const amounts: number[] = [];
  let match;
  let detectedSymbol = '$';
  while ((match = singlePattern.exec(text)) !== null) {
    detectedSymbol = match[1];
    const val = parseInt(match[2].replace(/[,\.]/g, ''), 10);
    if (val >= 100 && val <= 50_000_000) amounts.push(val);
  }
  currency = currencyMap[detectedSymbol] || 'USD';

  if (amounts.length === 1) return { min: null, max: amounts[0], currency };
  if (amounts.length >= 2) {
    amounts.sort((a, b) => a - b);
    return { min: amounts[0], max: amounts[amounts.length - 1], currency };
  }

  return { min: null, max: null, currency };
}

// Look for deadline dates near deadline-related keywords
function extractDeadline(text: string): { date: string | null; type: string | null } {
  const lower = text.toLowerCase();

  if (/\brolling\b/.test(lower)) return { date: null, type: 'Rolling' };
  if (/\bongoing\b/.test(lower) && /\bapplication|accept/i.test(lower)) return { date: null, type: 'Ongoing' };

  // Find text near deadline keywords
  const deadlineSection = text.match(
    /(?:deadline|due\s*date|apply\s+by|submission\s+(?:date|deadline)|closes?\s+on)[:\s]*([^\n]{5,80})/i
  );
  if (deadlineSection) {
    const dateStr = parseNaturalDate(deadlineSection[1]);
    if (dateStr) return { date: dateStr, type: 'Fixed' };
  }

  // Broader search for date patterns anywhere
  const datePatterns = [
    // "January 15, 2025" or "Jan 15, 2025"
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i,
    // "15 January 2025"
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i,
    // "2025-01-15"
    /\b(\d{4}-\d{2}-\d{2})\b/,
    // "01/15/2025" or "15/01/2025"
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  ];

  for (const pattern of datePatterns) {
    const m = text.match(pattern);
    if (m) {
      const dateStr = parseNaturalDate(m[1]);
      if (dateStr) return { date: dateStr, type: 'Fixed' };
    }
  }

  return { date: null, type: 'TBD' };
}

// Parse various date formats into YYYY-MM-DD
function parseNaturalDate(text: string): string | null {
  const cleaned = text.trim();

  // Try native Date parsing
  const d = new Date(cleaned);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035) {
    return d.toISOString().split('T')[0];
  }

  // Try "Month Day, Year" variants
  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
    september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const mdy = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdy) {
    const mon = months[mdy[1].toLowerCase()];
    if (mon !== undefined) {
      const date = new Date(parseInt(mdy[3]), mon, parseInt(mdy[2]));
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
  }

  return null;
}

// Look for region/geographic info
function extractRegion(text: string): string | null {
  const lower = text.toLowerCase();
  const regionPatterns: [RegExp, string][] = [
    [/\bglobal(?:ly)?\b/, 'Global'],
    [/\binternational\b/, 'International'],
    [/\bunited\s+states\b|\b(?:us|u\.s\.)\s+(?:only|based|residents|citizens)\b/, 'US'],
    [/\bnorth\s+america\b/, 'North America'],
    [/\beurope(?:an)?\b/, 'Europe'],
    [/\bunited\s+kingdom\b|\b(?:uk|u\.k\.)\b/, 'UK'],
    [/\bcanad(?:a|ian)\b/, 'Canada'],
    [/\baustrali(?:a|an)\b/, 'Australia'],
  ];
  for (const [pattern, region] of regionPatterns) {
    if (pattern.test(lower)) return region;
  }
  return null;
}

export async function scrapeGrantPage(url: string): Promise<ScrapedResult> {
  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ScraperError('Invalid URL format', 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ScraperError('Only http/https URLs are supported', 'INVALID_URL');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new ScraperError('Cannot fetch internal URLs', 'SSRF_BLOCKED');
  }

  // Fetch page
  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopiaBot/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new ScraperError(`Page returned ${res.status}`, 'FETCH_FAILED');
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new ScraperError('Page is not HTML', 'NOT_HTML');
    }
    html = await res.text();
    if (html.length > 5_000_000) {
      throw new ScraperError('Page too large', 'FETCH_FAILED');
    }
  } catch (err) {
    if (err instanceof ScraperError) throw err;
    throw new ScraperError('Could not fetch the page', 'FETCH_FAILED');
  }

  // Parse HTML
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  // Remove noise
  $('script, style, nav, footer, header, iframe, noscript').remove();

  // Extract metadata
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const pageTitle = $('title').text().trim() || null;
  const h1 = $('h1').first().text().trim() || null;
  const ogSiteName = $('meta[property="og:site_name"]').attr('content')?.trim() || null;
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim() || null;
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() || null;

  // Get main body text for heuristic extraction
  const mainEl = $('main, article, [role="main"], .content, #content').first();
  const bodyText = (mainEl.length ? mainEl.text() : $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15_000);

  // Extract grant name (always clean trailing site name suffixes)
  const rawName = ogTitle || pageTitle || h1;
  const grantName = rawName ? cleanTitle(rawName) : null;
  if (!grantName) {
    warnings.push('Could not determine grant name');
  }

  // Extract org name
  const orgName = ogSiteName || parsed.hostname.replace(/^www\./, '').split('.')[0];

  // Extract description
  const shortDescription = ogDesc || metaDesc || null;
  if (!shortDescription) warnings.push('Could not determine description');

  // Extract amounts
  const { min: amountMin, max: amountMax, currency } = extractAmounts(bodyText);
  if (!amountMin && !amountMax) warnings.push('Could not determine grant amount');

  // Extract deadline
  const { date: deadlineDate, type: deadlineType } = extractDeadline(bodyText);
  if (!deadlineDate && deadlineType === 'TBD') warnings.push('Could not determine deadline');

  // Extract region
  const region = extractRegion(bodyText);

  // Build source domain
  const source = parsed.hostname.replace(/^www\./, '');

  return {
    grant: {
      grantName,
      orgName,
      shortDescription,
      amountMin,
      amountMax,
      currency,
      deadlineType,
      deadlineDate,
      link: url,
      region,
      source,
    },
    warnings,
  };
}
