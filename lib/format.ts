// Display-only title-casing for enum/option labels (status, priority, type, etc.).
// Keeps existing capitals; turns snake_case into spaced words. Never changes stored values.
export const titleCase = (s: unknown): string => {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};
