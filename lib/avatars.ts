// Fun preset avatars — stored in the same avatar_url field as "preset:<emoji>", so they
// flow through avatarSrc()/Avatar everywhere a real photo would, with no extra columns.
export const PRESET_AVATARS = [
  '🦊','🐼','🐧','🦁','🐯','🐸','🐙','🦉','🐝','🦄','🐱','🐶',
  '🐵','🦓','🦋','🐢','🦅','🐬','🦔','🐨','🦝','🐰','🐲','🦒',
  '🌟','🚀','⚡','🔥','🌈','🍀','🎯','💎','🎨','🎸','👑','🧠',
];

const PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899',
  '#8b5cf6','#14b8a6','#f97316','#22c55e','#3b82f6','#a855f7',
];

export function presetColor(emoji: string): string {
  const h = emoji.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[h % PALETTE.length];
}

export const buildPreset = (emoji: string) => `preset:${emoji}`;

export function parsePreset(value?: string | null): { emoji: string; bg: string } | null {
  if (!value || !value.startsWith('preset:')) return null;
  const emoji = value.slice('preset:'.length);
  if (!emoji) return null;
  return { emoji, bg: presetColor(emoji) };
}
