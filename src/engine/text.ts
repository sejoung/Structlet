export const FONT_FAMILY =
  "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', system-ui, -apple-system, sans-serif";

function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === ' ') return 0.3;
  if (code >= 0x1100 && (code <= 0x11ff || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef))) return 0.98;
  if ('ilI.,:;|!\'`'.includes(ch)) return 0.28;
  if ('fjrt()[]{}/\\-'.includes(ch)) return 0.36;
  if ('mwMW@'.includes(ch)) return 0.86;
  if (ch >= 'A' && ch <= 'Z') return 0.66;
  return 0.56;
}

export function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w * fontSize;
}

function breakWord(word: string, maxWidth: number, fontSize: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    if (current && measureText(current + ch, fontSize) > maxWidth) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapText(text: string, maxWidth: number, fontSize: number, maxLines = 4): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measureText(word, fontSize) <= maxWidth) current = word;
      else {
        const pieces = breakWord(word, maxWidth, fontSize);
        lines.push(...pieces.slice(0, -1));
        current = pieces[pieces.length - 1] ?? '';
      }
    }
    lines.push(current);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/.$/u, '')}…`;
    return kept;
  }
  return lines;
}
