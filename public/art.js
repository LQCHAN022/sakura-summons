// Renders catalog ASCII art into colored HTML.
// Colors come from the item's base `color`, rectangular `paint` regions,
// then per-character `glyphs` overrides. `blink` swaps in closed-eye text.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const DEFAULT_COLOR = '#e8e6f0';

export function renderArt(item, { blink = false, silhouette = false } = {}) {
  const rows = item.art.map((line) => [...line]);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const base = item.color || DEFAULT_COLOR;
  const colors = rows.map((row) => row.map(() => base));

  for (const [r0, r1, c0, c1, color] of item.paint || []) {
    for (let r = r0; r < Math.min(r1, height); r++) {
      for (let c = c0; c < Math.min(c1, width); c++) colors[r][c] = color;
    }
  }

  const replaced = new Set();
  if (blink && item.blink) {
    for (const [r, c, text] of item.blink) {
      [...text].forEach((ch, i) => {
        if (rows[r] && c + i < width) {
          rows[r][c + i] = ch;
          replaced.add(r * 1000 + c + i);
        }
      });
    }
  }

  const escape = (s) => s.replace(/[&<>]/g, (ch) => ESC[ch]);
  if (silhouette) {
    return `<span class="sil">${escape(rows.map((r) => r.join('')).join('\n'))}</span>`;
  }

  const glyphs = item.glyphs || {};
  const lines = rows.map((row, r) => {
    let html = '';
    let current = null;
    let buffer = '';
    const flush = () => {
      if (buffer) html += current ? `<span style="color:${current}">${escape(buffer)}</span>` : escape(buffer);
      buffer = '';
    };
    row.forEach((ch, c) => {
      if (ch === ' ') {
        buffer += ch; // spaces have no color, keep the current run going
        return;
      }
      const color = (!replaced.has(r * 1000 + c) && glyphs[ch]) || colors[r][c];
      if (color !== current) {
        flush();
        current = color;
      }
      buffer += ch;
    });
    flush();
    return html;
  });
  return lines.join('\n');
}

export const stars = (n) => '★'.repeat(n);
