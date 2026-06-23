// Display-only title-casing for enum/option labels (status, priority, type, etc.).
// Keeps existing capitals; turns snake_case into spaced words. Never changes stored values.
export const titleCase = (s: unknown): string => {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// First name (or first token) for tight UI, capped with an ellipsis. Caller should
// put the FULL name in a title/tooltip. Never changes the stored value.
export const displayName = (name: unknown, max = 16): string => {
  const s = String(name ?? '').trim();
  if (!s || s === '—') return s;
  const first = s.split(/\s+/)[0];
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
};
