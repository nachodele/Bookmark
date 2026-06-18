const SOURCE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube' },
  { pattern: /instagram\.com/i, name: 'Instagram' },
  { pattern: /tiktok\.com/i, name: 'TikTok' },
  { pattern: /twitter\.com|x\.com/i, name: 'X' },
  { pattern: /facebook\.com|fb\.com/i, name: 'Facebook' },
  { pattern: /linkedin\.com/i, name: 'LinkedIn' },
  { pattern: /reddit\.com/i, name: 'Reddit' },
  { pattern: /spotify\.com/i, name: 'Spotify' },
  { pattern: /github\.com/i, name: 'GitHub' },
  { pattern: /medium\.com/i, name: 'Medium' },
  { pattern: /pinterest\.com/i, name: 'Pinterest' },
  { pattern: /whatsapp\.com/i, name: 'WhatsApp' },
];

export function detectSourceApp(url: string): string {
  for (const { pattern, name } of SOURCE_PATTERNS) {
    if (pattern.test(url)) return name;
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
  } catch {
    // ignore invalid URLs
  }

  return 'Web';
}

export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.split(/\s/)[0];
  }
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  return match?.[0] ?? null;
}

export function faviconUrl(url: string): string {
  try {
    const { origin } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${origin}&sz=64`;
  } catch {
    return '';
  }
}
