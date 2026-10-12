/**
 * Schémas maths / stats dans le chat Accueil (SVG).
 * Marqueurs stables — pas de markdown.
 */

const OPEN = "<<<SVG";
const CLOSE = "SVG>>>";

export function extractSvgFromAssistant(text: string): {
  svg: string | null;
  textWithoutSvg: string;
} {
  const start = text.indexOf(OPEN);
  const end = text.indexOf(CLOSE);
  if (start < 0 || end < 0 || end <= start) {
    return { svg: null, textWithoutSvg: text };
  }
  const raw = text.slice(start + OPEN.length, end).trim();
  const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
  const svg = svgMatch?.[0]?.trim() || null;
  const textWithoutSvg = `${text.slice(0, start).trim()}\n\n${text
    .slice(end + CLOSE.length)
    .trim()}`.trim();
  return { svg, textWithoutSvg };
}

/** data URL affichable dans <img> / lightbox. */
export function svgToDataUrl(svg: string): string {
  const cleaned = svg
    .replace(/<\?xml[^>]*>/i, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .trim();
  // Bloque scripts / handlers évidents
  if (/<script|on\w+\s*=|javascript:/i.test(cleaned)) {
    return "";
  }
  if (!/^<svg[\s>]/i.test(cleaned)) return "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`;
}

export function diagramSystemBlock(message: string): string {
  return `

DIAGRAM REQUEST (math / stats / axes):
The user wants a clear drawing (axes x-y, arrows, curve, histogram, etc.).
You MUST include exactly one SVG between these markers (plain text, no markdown):

${OPEN}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420">...</svg>
${CLOSE}

SVG rules:
- White background, dark strokes (#14261c), accent #1b4f3a or #e8892a sparingly.
- Draw x and y axes with arrowheads when relevant; label O, x, y (or units).
- Keep geometry precise (grid optional, light gray).
- No external images, no <script>, no event handlers.
- Short caption in the user language BEFORE the markers; honesty line AFTER the SVG block.
User ask: « ${message.trim().slice(0, 220)} »
`;
}
