// Custom Yjs network provider over Supabase Realtime (broadcast + presence).
// No extra server: each open document is a channel `drive_doc:<fileId>`. Clients
// relay Y.Doc updates as base64 broadcasts and merge them (CRDT = conflict-free),
// share an Awareness instance for live cursors, and use presence for the avatar
// stack. The authoritative content is loaded from the RLS-protected DB row before
// connecting; broadcast carries only diffs among clients that already have access.
import * as Y from 'yjs';
import {
  Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates,
} from 'y-protocols/awareness';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function u8ToB64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export function b64ToU8(b: string): Uint8Array {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export interface PresenceUser { id: string; name: string; color: string; }

export class SupabaseProvider {
  doc: Y.Doc;
  awareness: Awareness;
  channel: RealtimeChannel;
  synced = false;
  private _subscribed = false;
  private _onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private _onAwareness: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;

  constructor(
    private supabase: any, // app sb is typed to the snrpmo schema; we only use channel()/removeChannel()
    channelName: string,
    doc: Y.Doc,
    private me: PresenceUser,
  ) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField('user', { id: me.id, name: me.name, color: me.color });

    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false }, presence: { key: me.id } },
    });

    this._onDocUpdate = (update, origin) => {
      if (origin === this) return;
      this.channel.send({ type: 'broadcast', event: 'yu', payload: { u: u8ToB64(update) } });
    };
    this.doc.on('update', this._onDocUpdate);

    this._onAwareness = ({ added, updated, removed }) => {
      const changed = added.concat(updated).concat(removed);
      this.channel.send({ type: 'broadcast', event: 'ya', payload: { u: u8ToB64(encodeAwarenessUpdate(this.awareness, changed)) } });
    };
    this.awareness.on('update', this._onAwareness);

    this.channel
      .on('broadcast', { event: 'yu' }, ({ payload }) => {
        try { Y.applyUpdate(this.doc, b64ToU8(payload.u), this); } catch { /* ignore malformed */ }
      })
      .on('broadcast', { event: 'ya' }, ({ payload }) => {
        try { applyAwarenessUpdate(this.awareness, b64ToU8(payload.u), this); } catch { /* ignore */ }
      })
      .on('broadcast', { event: 'sync-req' }, () => {
        this.channel.send({ type: 'broadcast', event: 'yu', payload: { u: u8ToB64(Y.encodeStateAsUpdate(this.doc)) } });
        const keys = Array.from(this.awareness.getStates().keys());
        this.channel.send({ type: 'broadcast', event: 'ya', payload: { u: u8ToB64(encodeAwarenessUpdate(this.awareness, keys)) } });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !this._subscribed) {
          this._subscribed = true;
          this.channel.track({ user: this.me });
          this.channel.send({ type: 'broadcast', event: 'sync-req', payload: {} });
          this.synced = true;
        }
      });

    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this._beforeUnload);
  }

  private _beforeUnload = () => { this.destroy(); };

  onlineUsers(): PresenceUser[] {
    const seen = new Map<string, PresenceUser>();
    this.awareness.getStates().forEach((s) => {
      const u = (s as { user?: PresenceUser }).user;
      if (u && u.id) seen.set(u.id, u);
    });
    return Array.from(seen.values());
  }

  destroy() {
    try { this.doc.off('update', this._onDocUpdate); } catch { /* noop */ }
    try { this.awareness.off('update', this._onAwareness); } catch { /* noop */ }
    try { removeAwarenessStates(this.awareness, [this.doc.clientID], this); } catch { /* noop */ }
    try { this.awareness.destroy(); } catch { /* noop */ }
    try { this.supabase.removeChannel(this.channel); } catch { /* noop */ }
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this._beforeUnload);
  }
}
