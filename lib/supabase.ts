import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL as string;
const key = process.env.SUPABASE_KEY as string;

// Server-only client. RLS is open; the key is never shipped to the browser.
export function db() {
  return createClient(url, key, {
    db: { schema: 'snrpmo' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
