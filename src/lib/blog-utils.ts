// Pure helpers shared by the admin blog editor (client) and the public
// blog pages (server): slugs, headings, reading time and the SEO checklist.

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface Heading {
  id: string;
  label: string;
  level: 2 | 3;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Strip markdown syntax down to readable text (for counts and excerpts). */
export function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(md: string): number {
  const plain = markdownToPlain(md);
  return plain ? plain.split(' ').length : 0;
}

export function readMinutes(md: string): number {
  return Math.max(1, Math.round(countWords(md) / 220));
}

/** Same id scheme the markdown renderer uses for heading anchors. */
export function headingId(label: string, used: Map<string, number>): string {
  const base = slugify(label) || 'section';
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n + 1}`;
}

export function extractHeadings(md: string): Heading[] {
  const used = new Map<string, number>();
  const out: Heading[] = [];
  let inCode = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const label = m[2].replace(/[*_`]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
    out.push({ id: headingId(label, used), label, level: m[1].length === 2 ? 2 : 3 });
  }
  return out;
}

export function parseList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

// ------------------------------------------------------------
// SEO checklist
// ------------------------------------------------------------

export interface SeoInput {
  title: string;
  seoTitle: string;
  slug: string;
  description: string;
  content: string;
  focusKeyword: string;
  coverUrl: string;
  coverAlt: string;
}

export interface SeoCheck {
  id: string;
  label: string;
  status: 'good' | 'warn' | 'bad';
  hint: string;
}

export function runSeoChecks(i: SeoInput): { score: number; checks: SeoCheck[] } {
  const kw = i.focusKeyword.trim().toLowerCase();
  const has = (text: string) => (kw ? text.toLowerCase().includes(kw) : false);
  const effectiveTitle = (i.seoTitle || i.title).trim();
  const words = countWords(i.content);
  const plain = markdownToPlain(i.content);
  const firstPara = plain.slice(0, 160);
  const headings = extractHeadings(i.content);
  const images = [...i.content.matchAll(/!\[([^\]]*)\]\(/g)];
  const imagesNoAlt = images.filter((m) => !m[1].trim()).length;
  const internalLinks = [...i.content.matchAll(/\]\((\/[^)]*|https?:\/\/(?:www\.)?repeatgrow\.com[^)]*)\)/g)].length;
  const kwCount = kw ? (plain.toLowerCase().match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length : 0;
  const density = words > 0 ? (kwCount / words) * 100 : 0;

  const checks: SeoCheck[] = [
    {
      id: 'kw-set',
      label: 'Focus keyword is set',
      status: kw ? 'good' : 'bad',
      hint: kw ? kw : 'Pick the one phrase people would search for to find this post.',
    },
    {
      id: 'kw-title',
      label: 'Keyword in the title',
      status: !kw ? 'warn' : has(effectiveTitle) ? 'good' : 'bad',
      hint: 'Put the focus keyword near the start of the SEO title.',
    },
    {
      id: 'kw-desc',
      label: 'Keyword in the meta description',
      status: !kw ? 'warn' : has(i.description) ? 'good' : 'bad',
      hint: 'Mention the focus keyword once in the description.',
    },
    {
      id: 'kw-slug',
      label: 'Keyword in the URL',
      status: !kw ? 'warn' : i.slug.includes(slugify(kw)) ? 'good' : 'warn',
      hint: 'A URL containing the keyword helps (e.g. /blog/whatsapp-pay-india).',
    },
    {
      id: 'kw-intro',
      label: 'Keyword in the first paragraph',
      status: !kw ? 'warn' : has(firstPara) ? 'good' : 'warn',
      hint: 'Use the keyword in the opening sentence or two.',
    },
    {
      id: 'kw-density',
      label: 'Keyword used naturally',
      status: !kw || words < 100 ? 'warn' : density > 0 && density <= 2.5 ? 'good' : 'warn',
      hint: kw ? `Used ${kwCount}× (${density.toFixed(1)}%). Aim for 0.5–2%.` : 'Set a focus keyword first.',
    },
    {
      id: 'title-len',
      label: 'Title length (30–60 characters)',
      status: effectiveTitle.length >= 30 && effectiveTitle.length <= 60 ? 'good' : effectiveTitle.length === 0 ? 'bad' : 'warn',
      hint: `Currently ${effectiveTitle.length}. Longer titles get cut off in Google.`,
    },
    {
      id: 'desc-len',
      label: 'Meta description (110–160 characters)',
      status: i.description.length >= 110 && i.description.length <= 160 ? 'good' : i.description.length === 0 ? 'bad' : 'warn',
      hint: `Currently ${i.description.length}.`,
    },
    {
      id: 'words',
      label: 'Post length (at least 600 words)',
      status: words >= 600 ? 'good' : words >= 300 ? 'warn' : 'bad',
      hint: `${words} words so far. Longer, useful posts tend to rank better.`,
    },
    {
      id: 'headings',
      label: 'Subheadings (H2/H3)',
      status: headings.length >= 3 ? 'good' : headings.length > 0 ? 'warn' : 'bad',
      hint: `${headings.length} found. Break the post into sections of 150–300 words.`,
    },
    {
      id: 'kw-heading',
      label: 'Keyword in a subheading',
      status: !kw ? 'warn' : headings.some((h) => has(h.label)) ? 'good' : 'warn',
      hint: 'Use the keyword (or a close variant) in at least one H2.',
    },
    {
      id: 'cover',
      label: 'Cover image with alt text',
      status: i.coverUrl && i.coverAlt.trim() ? 'good' : i.coverUrl ? 'warn' : 'bad',
      hint: 'Add a cover image and describe it in the alt text.',
    },
    {
      id: 'img-alt',
      label: 'Images inside the post have alt text',
      status: images.length === 0 ? 'warn' : imagesNoAlt === 0 ? 'good' : 'bad',
      hint: images.length === 0 ? 'Add at least one image to break up the text.' : `${imagesNoAlt} of ${images.length} missing alt text.`,
    },
    {
      id: 'links',
      label: 'Links to other Repeat Grow pages',
      status: internalLinks >= 2 ? 'good' : internalLinks === 1 ? 'warn' : 'bad',
      hint: `${internalLinks} internal link(s). Link to /pricing, /demo or related posts.`,
    },
  ];

  const points = checks.reduce((n, c) => n + (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  return { score: Math.round((points / checks.length) * 100), checks };
}
