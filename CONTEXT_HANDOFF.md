# SNR-PMO — Context Handoff

> Paste this into a fresh chat to resume. Single source of truth for status = `ROADMAP.md`; this is the compact session handoff.
> Last handoff: 2026-06-11 (after responsive reflow pass, commit `f785eba`).

## EXPORT CONTEXT — resume 2026-06-11 (design/polish sprint)

HEAD = `f785eba` (base for next clone). Vercel READY + aliased snr-pmo.vercel.app; esbuild SWC-parity clean on all 14 changed tsx. E: copy mirrored full; ROADMAP top line + memory `snr-pmo-light-theme` updated.

### Shipped this session
**`f785eba` — RESPONSIVE REFLOW PASS** (frontend-only, no DB/RLS; 14 tsx). Cleared next-queue #1 (per-page reflow).
- `/crm` pipeline rebuilt on the tasks.tsx master/detail pattern. Detail `<aside>` (was `hidden xl:block` → invisible+unreachable below xl) extracted into a shared `const DetailPanel` rendered BOTH as permanent `xl:block` sidebar AND `xl:hidden` fixed slide-in overlay drawer, gated by new `showDetail` state. `selectDeal(id)` sets selectedId+showDetail; X button + backdrop close; deal-delete sets showDetail=false; auto-select-first uses `setSelectedId` ONLY so the drawer never auto-opens. Added `lg:hidden` horizontally-scrollable stage-filter chip row (mobile keeps stage filtering); desktop `w-48 hidden lg:block` stage sidebar unchanged.
- `/users` + `/payroll` master/detail rows: `flex gap-4`→`flex flex-col lg:flex-row gap-4`; master card `w-72 shrink-0`→`w-full lg:w-72 lg:shrink-0` (stack on mobile vs squeeze).
- All 12 data tables wrapped `<div className="overflow-x-auto">…</div>` (platform×2, leave×2, audit, employees/[id], employees/index, projects, financial, payroll, projects/[id]×3, attendance, risk, crm contacts). Inner scroll works even inside `card overflow-hidden`.
- Fixed detail grids → responsive: `grid-cols-1 sm:grid-cols-2/3` on leave, employees/[id], users, roles, payroll.
- Done INLINE (not fanned to agents — supervisor context warm; spawn would re-pay cold-start). **tasks.tsx is the canonical master/detail reflow reference for any future page.**

### Deploy flow (proven, gotcha-safe)
- E: is cloud-synced and serves **TRUNCATED** files to bash — NEVER bash-cat/cp/esbuild SOURCE from E:. Edit E: via Read/Write tools (hydrated).
- To deploy: `git clone --depth 1 https://<PAT>@github.com/mtspk247/SNR-PMO.git /tmp/snrdeploy_$(date +%s)` (fresh dir name each time — old clones leave perm-locked files). Re-apply the change in the clone (heredoc for new/full-file; python `str.replace` / `re.DOTALL` for patches). `npx --yes esbuild <f> --loader:.tsx=tsx --jsx=automatic --bundle=false --format=esm` per changed file. Commit ONLY changed files → push main → confirm READY via Vercel get_deployment/list_deployments.
- MIRROR back to E: cheaply by `cp` from the FULL clone into the E: mount (writes full bytes; avoids pulling file contents through context), then spot-verify ONE file with the Read tool (hydrated).
- Any DB change: RLS-sim `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"<id>","role":"authenticated"}',true); <stmt>; rollback;` (NEVER a bare DO block — autocommits).
- Reading clone files: Read/Edit tools CANNOT reach `/tmp` (outside connected folders) — use bash `sed`/`grep` on the clone, and the Read tool for E:.

### Infra
Supabase `dkjdtyzjdkumnpdyezbs`, schema `snrpmo`, snr org `e1cf12fa-a325-42e1-8d10-5391852fe65f`. Vercel project `prj_8FngZQ60B6LibvplLiXfviMLCxkF` / team `team_5ScJADMy7byUbqZlf5f5Ks2P`. GitHub `mtspk247/SNR-PMO` (PUBLIC) main → auto-deploy. PAT + break-glass login in `CREDENTIALS.local.md`. **PAT was shared in chat across sessions — ROTATE IT.** Tariq app-user `373da199` (admin, auth `103708a8`); break-glass owner `superadmin@snr-pmo.app` (auth `b9e95725`).

### Next queue (one independent chunk at a time; RLS-sim every DB change; esbuild+deploy)
1. TanStack Query + pagination [task 7] — now the biggest remaining design/perf debt.
2. (optional) Richer dashboard toward `final-1` — already fairly rich post-dcf262e; marginal ROI, only if Tariq asks.

### Pending (manual / specific logins — can't do headlessly)
- Supabase Auth redirect URLs for `/update-password`.
- `/platform` plan-downgrade click-through (needs platform-owner login, not break-glass org owner).
- `/leave` delegated-approve click-through (needs non-admin `can_approve_leaves` user + a pending request from someone else).

### Design direction (locked)
Supabase LIGHT primary (no dark default); palette `Reference Pictures/supabase color palette.png`; layout target `final-1.png`; tokens in `globals.css` + `tailwind.config.js` (NOT hardcoded). Token classes: `.input/.textarea/.label/.btn/.btn-primary/.btn-ghost/.btn-danger/.card/.stat/.pill-*`; color tokens `bg-surface/surface2`, `text-content/muted/muted2`, `border-line`, `bg-accent/text-accentstrong/accentfg`. NOTE: `crm.tsx` still uses the OLDER non-token palette (`bg-white/text-ink/text-neutral-*/bg-paper`) — match that within crm; consider a token migration later. Modal system app-wide — any new modal MUST use `@/components/Modal` (Modal + Field).

---

## How to use AGENT_ORCHESTRATION_PLAYBOOK.md smartly

**ROLE:** You are the SUPERVISOR (run on Opus — highest blast radius). You own the plan, all git, a