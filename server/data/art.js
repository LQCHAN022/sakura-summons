// Normalizes a String.raw block into an array of equal-width lines.
// Leading/trailing blank lines and the common left indent are removed.
export function art(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length)
  );
  const out = lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
  const width = Math.max(...out.map((l) => l.length));
  return out.map((l) => l.padEnd(width));
}
