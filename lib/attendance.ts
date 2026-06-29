import { AppUser, MyOrg, Attendance } from './supabase';
import { checkIn, checkOut, getMyManagerId, notify } from './db';

/** Best-effort browser geolocation. Resolves null if unsupported, denied, or timed out —
 *  check-in must never be blocked by a missing/denied location. */
export function getGeo(): Promise<{ lat: number; lng: number; accuracy?: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    let done = false;
    const finish = (v: { lat: number; lng: number; accuracy?: number } | null) => { if (!done) { done = true; resolve(v); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => finish(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    } catch { finish(null); }
    setTimeout(() => finish(null), 9000);
  });
}

/** Check in with best-effort location, notify the reporting manager, and broadcast
 *  `snr:checkin` so the footer timer + the bottom-left confirmation popup update. */
/** Best-effort reverse geocode to a short place label via OpenStreetMap (no key).
 *  Coarse zoom for privacy; falls back to coordinates; never throws/blocks check-in. */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const coords = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return coords;
    const j: any = await r.json();
    const a = j.address || {};
    const area = a.suburb || a.neighbourhood || a.city_district || a.quarter || a.village || a.town;
    const city = a.city || a.town || a.county || a.state;
    const label = Array.from(new Set([area, city].filter(Boolean))).slice(0, 2).join(', ');
    return label || (j.display_name ? String(j.display_name).split(',').slice(0, 2).join(',').trim() : coords);
  } catch { return coords; }
}

export async function performCheckIn(me: AppUser, org: MyOrg): Promise<Attendance> {
  const geo = await getGeo();
  const place = geo ? await placeName(geo.lat, geo.lng) : null;
  const row = await checkIn(me.id, org.id, geo, place);
  let notified = false;
  try {
    const mgr = await getMyManagerId(me.id);
    if (mgr && mgr !== me.id) {
      const t = row.check_in ? new Date(row.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      await notify({
        org_id: org.id, user_id: mgr, type: 'SYSTEM',
        title: `${me.full_name || 'A teammate'} checked in`,
        body: `Checked in${t ? ` at ${t}` : ''}${geo ? ` · ${place || 'location captured'}` : ''}.`,
        link: '/attendance', entity_type: 'attendance', entity_id: row.id,
      });
      notified = true;
    }
  } catch { /* notify is best-effort; never blocks check-in */ }
  try { window.dispatchEvent(new CustomEvent('snr:checkin', { detail: { time: row.check_in, located: !!geo, notified, place } })); } catch { /* ignore */ }
  return row;
}

/** Check out and broadcast `snr:checkout` so the footer timer clears. */
export async function performCheckOut(row: Attendance): Promise<Attendance> {
  const out = await checkOut(row);
  try { window.dispatchEvent(new CustomEvent('snr:checkout', { detail: { time: out.check_out } })); } catch { /* ignore */ }
  return out;
}
