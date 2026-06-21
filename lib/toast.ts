// Lightweight app-wide imperative toast (separate from the SYSTEM-notification
// poller in components/Toaster.tsx, which also renders these). Call toast(...)
// from anywhere; <Toaster/> (mounted in Layout) shows it bottom-right.
export type ToastTone = 'success' | 'error' | 'info';
export type UiToast = { id: string; title: string; body?: string; tone: ToastTone };

type Listener = (t: UiToast) => void;
const listeners = new Set<Listener>();

export function onToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function toast(title: string, tone: ToastTone = 'info', body?: string): void {
  const t: UiToast = { id: Math.random().toString(36).slice(2), title, tone, body };
  listeners.forEach((fn) => fn(t));
}

export const toastSuccess = (title: string, body?: string) => toast(title, 'success', body);
export const toastError = (e: unknown, fallback = 'Something went wrong') =>
  toast(typeof e === 'string' ? e : ((e as { message?: string })?.message || fallback), 'error');
