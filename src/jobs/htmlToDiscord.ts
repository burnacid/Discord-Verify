// Converts the HTML of a feed item's full content (WordPress `content:encoded`)
// into Discord markdown. Deliberately small and regex-based: feed HTML is
// simple post markup, and anything we don't recognise is stripped to its text.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function htmlToDiscord(html: string): string {
  let s = html;

  // Content that should never show up as text.
  s = s.replace(/<(script|style|iframe|noscript|figure)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Feed HTML is pretty-printed; real line breaks come from tags below.
  s = s.replace(/\s*\n\s*/g, " ");

  // Escape markdown in the post's own text (between tags) so a literal "*"
  // or "_" doesn't turn into formatting; our own markers are added after.
  s = s.replace(/(^|>)([^<]+)/g, (_, open: string, text: string) => open + text.replace(/([\\*_~`|])/g, "\\$1"));

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, (_, t: string) => `\n\n## ${t.trim()}\n\n`);
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_, t: string) => `\n\n### ${t.trim()}\n\n`);
  s = s.replace(/<li[^>]*>/gi, "\n• ");
  s = s.replace(/<\/(p|div|ul|ol|blockquote|table|tr)>/gi, "\n\n");
  s = s.replace(/<(p|div|ul|ol|blockquote|table|tr)[^>]*>/gi, "\n\n");

  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, t: string) => wrap(t, "**"));
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, t: string) => wrap(t, "*"));
  s = s.replace(/<(u)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, t: string) => wrap(t, "__"));
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, t: string) => {
    const text = t.replace(/<[^>]+>/g, "").trim();
    const url = decodeEntities(href);
    if (!/^https?:\/\//i.test(url)) return text;
    return !text || text === url ? url : `[${text}](${url})`;
  });

  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);

  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Keep markers tight around the text (`** bold **` doesn't render in Discord).
function wrap(text: string, marker: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : text;
}

// Splits text into chunks: the first at most `firstMax` chars, the rest at
// most `restMax`. Breaks at a paragraph, then line, then word boundary,
// falling back to a hard cut only for a single unbroken run of text.
export function splitText(text: string, firstMax: number, restMax: number): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest) {
    const max = chunks.length === 0 ? firstMax : restMax;
    if (rest.length <= max) {
      chunks.push(rest);
      break;
    }
    const slice = rest.slice(0, max + 1);
    const minCut = Math.floor(max * 0.4);
    let cut = -1;
    for (const sep of ["\n\n", "\n", " "]) {
      const at = slice.lastIndexOf(sep);
      if (at >= minCut) {
        cut = at;
        break;
      }
    }
    if (cut === -1) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return chunks;
}

// Shortens text to at most `max` chars, preferring a paragraph, line or word
// boundary over cutting mid-word.
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return max === 1 ? "…" : "";
  const slice = text.slice(0, max - 1);
  const minCut = Math.floor(max * 0.6);
  for (const sep of ["\n\n", "\n", " "]) {
    const cut = slice.lastIndexOf(sep);
    if (cut >= minCut) return slice.slice(0, cut).trimEnd() + "…";
  }
  return slice.trimEnd() + "…";
}
