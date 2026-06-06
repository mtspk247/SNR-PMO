# SNR-PMO — Project Management & Operations

Full-stack implementation of the SNR-PMO PRD (v1.0) on **Next.js 15 (App Router) + Supabase (Postgres)**.
Originally specced on Google Sheets/Apps Script; this is the modern, extensible build the PRD flagged as the migration target.

## Modules
- **Auth/RBAC** — custom username/password (SHA-256 + per-user salt), signed 8h session cookie, 4 roles + custom permission matrix.
- **Projects** — CRUD, status lifecycle, auto progress %, list view.
- **Tasks/Subtasks** — kanban + list, single assignee + followers, subtask blocking rule (parent can't be Done until subtasks are), tags.
- **Comments** — threads on projects/tasks with `@mention` parsing → notifications.
- **Attendance** — daily check-in/out, hours calc, IP logging, auto-checkout cron.
- **Leave** — request → approval chain (Reports To → Admin), balances, admin override.
- **Notifications** — in-app, bubbles up the reports-to hierarchy, unread badge.
- **Audit Log** — append-only, every CRUD/auth/attendance/leave action.
- **Dashboard** — widgets per role (active projects, overdue, who's-in, team, pending approvals).
- **EOD Email** — 6 PM EST cron builds per-PM team summaries (emails via Resend if configured, else in-app).
- **Admin** — user management + custom permissions, settings.

## Database
Already provisioned on Supabase project `wgyceduyzuuziybylgzp`, schema **`snrpmo`** (isolated from other apps in that project). Schema + seed are applied. Seeded Super Admin: **`admin` / `SnrPmo@2026`**.

## Environment variables (set these in Vercel)
| Var | Value |
|-----|-------|
| `SUPABASE_URL` | `https://wgyceduyzuuziybylgzp.supabase.co` |
| `SUPABASE_KEY` | `sb_publishable_T0Rr7lx8eNMUIqUsYGOmDw_MnKg9H23` |
| `SESSION_SECRET` | any long random string (e.g. `openssl rand -hex 32`) |
| `CRON_SECRET` | any long random string (protects /api/cron/*) |
| `RESEND_API_KEY` | *(optional)* enables EOD emails |
| `EOD_FROM` | *(optional)* e.g. `SNR-PMO <noreply@yourdomain>` |

> The Supabase key is read **server-side only** (not `NEXT_PUBLIC`); the browser never talks to the DB directly. All access is gated by the session cookie in server actions/route handlers.

## Deploy (Vercel)
1. Push this repo to GitHub.
2. In Vercel → **Add New → Project → Import** this repo (framework auto-detects Next.js).
3. Add the env vars above.
4. Deploy. `vercel.json` registers the two cron jobs automatically.

## Local dev
```bash
npm install
cp .env.example .env   # fill in values
npm run dev
```
