# SYSTEM_GUIDE.md — SNR-PMO

> Single-page reference for the entire platform: architecture, module map, cross-module connections, and the recommended agency operating workflow.

---

## 1. Tenancy & RBAC hierarchy

```
Org
 └─ Company (optional per project)
     └─ Portfolio (optional per project)
         └─ Project
```

Every data row is scoped to `org_id`. Row-Level Security enforces isolation — a user in Org A never sees Org B's data.

| Layer | Roles |
|---|---|
| Org | `owner` · `admin` · `member` |
| Company | `manager` · `member` |
| Portfolio | `manager` · `member` |
| Project | `manager` · `contributor` · `viewer` |
| Guest | external, project-scoped, **seat-exempt** |

Feature entitlements (CRM, HR, Risk, Financial, Portfolios, Integrations, Audit) are controlled per plan via the `platform` layer. Modules not in the plan are hidden from nav automatically.

---

## 2. Module map

### Dashboard
- Aggregated KPIs: open projects, overdue tasks, pipeline value, net ledger balance, headcount, leads/forms/social/inbox/agent-approvals (all feature-gated).
- **Cockpit widgets (uplift Slice 1–2):** Needs attention (overdue tasks, agent actions, leave/expense approvals, overdue invoices, open inbox — deep-links to the exact record), AI agent ROI (30-day hours-saved/value/net-of-spend/reliability → /agent-activity), Storage (drive+recording usage vs plan quota → /drives). All fed by the single org-scoped `dashboard_counts(org)` RPC (member-gated, one round-trip) + `agent_roi_summary`.
- Fully customisable RGL layout (drag/resize/add/remove/variants; per-user + admin workspace default + reset). Every tile links to its module. Entry point for daily situational awareness.

### Work

| Module | Key capabilities |
|---|---|
| **Companies** | Client/vendor registry. Linked from Projects and CRM. |
| **Portfolios** | Group projects for programme-level tracking. Optional per project. |
| **Projects** | Core delivery unit. Detail page: Tasks, Risks, Financials, Ledger, Discussion. Linked to Company and Portfolio. |
| **Tasks** | Subtasks, followers, @mention comments, color tags, **checklists**, **time tracking** (live timer + manual log), **recurring schedules** (daily/weekly/biweekly/monthly), **reminders**, and **team assignment**. Assignable across project members. |
| **Ideas** | Pitch board with voting. Any org member can submit; managers convert winning ideas to Projects. |
| **Chat** | Org-wide General channel + auto-created per-project channel. **@mention** people, **#link** tasks/projects, **/remind**, and **#commands** — type #task / #onboard / #expense (or custom admin-defined commands) and an agent proposes the action for approval; commands are configured on the Agents page (data-driven `agent_chat_commands`, per-command RBAC, approval-gated by default — with optional admin auto-run for low-risk reversible actions, plus custom natural-language commands via the AI proposer). 12s polling. No external dependency. |
| **Calendar** | Month grid of task due-dates + approved/pending leave; click an item to open it. |
| **Roadmap** | Gantt timeline of projects grouped by portfolio, with progress overlay, today line, and an Unscheduled bucket. |

### Tracking

| Module | Key capabilities |
|---|---|
| **Risk Analysis** | Project-level risk register (probability × impact matrix). Feature-gated: `risk`. |
| **Financial Data** | Per-project budget lines and actuals. Feature-gated: `financial`. |
| **Accounting** | Org-wide ledger: income and expense entries, plus a **P&L tab** (6-month category × month matrix, CSV export). Payroll runs auto-post Salary entries on Processed/Paid. Feature-gated: `financial`. |

### CRM

| Module | Key capabilities |
|---|---|
| **Sales Pipeline** | Kanban: Lead → Qualified → Proposal → Negotiation → Won / Lost. Custom fields on Deals, Contacts, Companies. Activity log per record. Feature-gated: `crm`. |

### HR

| Module | Key capabilities |
|---|---|
| **Onboarding** | Templates with day-offset tasks + required docs + linked Training Docs. Per-hire checklists generated from template. |
| **Employees** | Profiles with **avatars**, **lifecycle stage**, a **30-day KPI tab** (tasks/hours/attendance/leave), compensation history (**monthly or hourly**), custom fields. Linked to org members. |
| **Training & JDs** | Training library (file/link, category, department, role template link). Job descriptions (summary, responsibilities, requirements). |
| **Payroll** | Pay runs → **"Load active employees"** auto-builds payslips for all active staff (hours from time tracking, days from attendance, gross by pay type; idempotent). Tagged bonuses + custom disbursements per slip. On Processed/Paid: auto-posts **net** Salary entry to the Accounting ledger (idempotent via `payroll_run_id`). |
| **Attendance** | Clock in/out per employee. Auto-checkout at 00:05 UTC daily. |
| **Leave** | Balances (annual/sick/casual). Requests → delegated approver approval → server-enforced balance decrement. |

### Administration

| Module | Key capabilities |
|---|---|
| **Users** | Assign org roles; toggle per-user capability flags (`can_*`). **Teams** tab: group members for task assignment + visibility. |
| **Roles** | Role templates. Editing a template propagates permission changes to all users on that role. **Page access (per-page CRUD):** each role + user carries a `page_perms` jsonb (`{href:{c,r,u,d}}`) edited via the module→page tree (`components/PagePermTree`, module = sidebar menu group, e.g. Finance / Marketing / Inbox); **View(read)** off hides a page from sidebar/search + route-guards it (`lib/entitlements` `pageReadable`/`effectivePagePerm`; `lib/nav` `MODULE_GROUPS`/`navHrefForRoute`; enforced in `components/Layout`). C/U/D = UI affordance now, per-module RLS enforcement layered next. Visibility only — RLS stays the wall. |
| **Integrations** | Catalog of third-party connectors. Feature-gated: `integrations`. |
| **Audit Log** | DB-trigger-captured event stream for 16 tables. Immutable. Feature-gated: `audit`. |
| **Settings** | White-label branding: logo, primary color → live CSS theme tokens across the whole app. |

### Platform (super-admin only)
- Manage tenants, plans, feature matrix, seat limits.

---

## 3. Cross-module connections

These are the wiring points that make the system a unified platform rather than isolated modules. Understand them to avoid data silos.

| Source | Destination | How |
|---|---|---|
| **Payroll run** (Processed/Paid) | **Accounting ledger** | `payroll→accounting` trigger auto-posts a Salaries ledger entry per run. Rolling back a payroll run does not reverse the ledger entry — reverse manually if needed. |
| **Onboarding template** | **Training docs** | Each checklist item can link a Training Doc. When a hire is onboarded, the linked docs appear in their checklist. |
| **Ideas** | **Projects** | A manager clicks "Convert to Project" on a voted idea. The idea is marked converted; a new Project is created pre-populated from the idea's title/description. |
| **CRM Deals** | **Companies & Contacts** | Deals belong to a CRM Company and Contact. The CRM Company is a separate record from the Work Companies module, though both can represent the same client. |
| **Projects** | **Companies & Portfolios** | Each project optionally links to one Company and one Portfolio for grouping and reporting. |
| **Leave requests** | **Leave balances** | Approval of a leave request decrements the employee's balance server-side. The balance is the source of truth; attendance records are separate. |
| **Role templates** | **User permissions** | Roles are templates. Changing a role template's permission set immediately affects all users assigned that role. Per-user `can_*` flags override role defaults. |
| **Plan features** | **Nav visibility** | Feature keys (`crm`, `hr`, `risk`, `financial`, `portfolios`, `integrations`, `audit`) gate entire nav sections. Modules not in the org's plan are invisible, not just disabled. |
| **Settings branding** | **Entire UI** | Logo + primary color saved in Settings emit CSS custom properties consumed by Tailwind tokens throughout the app. White-labeling is live — no rebuild needed. |
| **Recurring task** (marked Done) | **Next task instance** | Completing a recurring task spawns the next occurrence; the repeat rule moves to the new clone. |
| **Time tracking + Attendance** | **Payroll** | "Load active employees" pulls logged hours and attendance days into each payslip. |
| **Reminders + @mentions** | **Notification bell** | Due reminders (cron, every 15 min) and chat @mentions create notifications; clicking one deep-links to the task/leave/deal/employee. |
| **Guest invite** | **Project membership** | Inviting a guest from a project creates a seat-exempt external user added as a project viewer, fenced from directory/HR/finance. |

---

## 4. Max-benefit agency playbook

Recommended sequence for a new agency deployment. Each step builds on the last.

### Phase 0 — Foundation (one-time)
1. **Platform**: create the org tenant, assign a plan with the features you need.
2. **Settings**: upload logo, set primary brand color. The whole app re-themes immediately.
3. **Roles**: define your role templates (e.g., Project Manager, Finance Lead, Contributor). Permissions propagate automatically.
4. **Users**: invite team members, assign roles, set any `can_*` overrides.

### Phase 1 — Client & pipeline setup
5. **Companies (Work)**: create entries for your clients and vendors.
6. **Portfolios**: create programme groupings if you manage multiple related projects per client.
7. **CRM pipeline**: add CRM Companies and Contacts mirroring your active prospects. Move deals through Lead → Qualified → Proposal → Negotiation.

### Phase 2 — Project delivery
8. **CRM Won deal → Project**: when a deal is won, create the Project linked to the client Company and Portfolio. Use the Ideas board for pre-sales concepts that need team input before committing.
9. **Projects detail**: populate tasks, assign contributors, set risk items, enter budget lines in Financial Data.
10. **Chat**: the project channel is auto-created. Use it for async updates; @mention comments on tasks keep context in context.

### Phase 3 — Staffing & onboarding
11. **HR → Employees**: create employee profiles for all staff working on the project.
12. **Training & JDs**: build out the training library and job descriptions before you onboard.
13. **Onboarding templates**: define templates with day-offset tasks and link relevant Training Docs. Apply a template to each new hire to generate their checklist automatically.

### Phase 4 — Ongoing operations
14. **Tasks & Risk**: keep project tasks updated daily. Log risk items as they emerge (probability × impact). The Dashboard surfaces overdue tasks and open risks.
15. **Attendance & Leave**: staff clock in/out. Approve leave requests to keep balances accurate; auto-checkout catches forgotten clock-outs.
16. **Payroll**: run payroll monthly. Mark runs Processed then Paid — ledger entries post automatically to Accounting.
17. **Accounting**: review the org ledger for income vs. expense balance. Financial Data gives per-project actuals alongside the org-wide view.

### Phase 5 — Review & governance
18. **Dashboard**: weekly KPI review — projects, pipeline value, overdue tasks, net balance.
19. **Audit Log**: periodic compliance review of all data changes across 16 tables.
20. **Ideas**: encourage team to submit continuous improvement ideas. Vote, then convert the best ones to next-cycle projects — closing the loop.

---

## 5. Key design decisions (for operators)

- **RLS-first**: every query is isolated by `org_id` at the database layer. Application code cannot accidentally leak cross-org data.
- **INSERT-RETURNING safety**: write paths use `return=minimal` + a subsequent re-fetch rather than `.select()` after insert, avoiding the RLS re-application edge case.
- **Polymorphic custom fields**: CRM (Deals, Contacts, Companies) and HR (Employees) share a single custom fields schema. Admins define fields once per entity type; all records in that entity get the field.
- **Trigger-based audit**: the audit log is written by DB triggers, not application code. It cannot be bypassed by a misconfigured API call.
- **White-label is CSS tokens**: branding changes write `--color-accent` and related custom properties. No per-tenant builds, no CDN invalidation.
- **Payroll→ledger is a DB trigger**: the accounting entry is created inside the same transaction as the payroll status update. It is idempotent (`payroll_run_id` unique key) — re-processing a run does not double-post.


## Developer API & webhooks

Workspace-scoped REST API + signed outgoing webhooks, managed under **Developer**. Single source of help: `/docs#developer-api` (the in-app AI assistant grounds on it automatically).

- **Auth**: create a key (Developer ▸ API keys) and send `Authorization: Bearer snrp_...`. Keys are workspace-scoped, read+write, revocable instantly. Every request can only touch the issuing workspace — the org id is applied server-side, never sent by the client.
- **Base URL**: `https://dkjdtyzjdkumnpdyezbs.supabase.co/functions/v1/api-v1`
- **Read**: `GET /api-v1/<resource>` (`?limit=` ≤200, `?offset=`), `GET /api-v1/<resource>/<id>`.
- **Write**: `POST /api-v1/<resource>`, `PATCH`/`DELETE /api-v1/<resource>/<id>`. Only whitelisted columns accepted.
- **Resources**: `tasks`, `projects`, `deals`, `contacts`, `accounts` (CRM companies), `companies` (workspace Company layer) are read+write; `invoices` read-only. `company_id` on deals/contacts references an **accounts** (crm_companies) record.
- **Webhooks**: add an endpoint (Developer ▸ Webhooks), pick events or `*`. Each delivery carries `X-SNRPMO-Signature: sha256=` + HMAC-SHA256(rawBody, endpointSecret). Events: `task.created`, `project.created`, `deal.created`, `deal.stage_changed`, `deal.won`, `invoice.created`, `invoice.paid`, `client.created`. Slack/Teams/Discord endpoints receive formatted messages instead of raw JSON. Delivery is server-side (edge-fn dispatcher) with exponential-backoff retries (up to 6 attempts) recording the real HTTP status code per attempt.

## AI Agents & approvals (Phase 3.1)
Agents are approve-first AI workers for the back office (accounting, tasks, CRM, HR, support). An agent is a **scoped principal, never a bypass**: it can only do what the approving person could, through the same RLS/RBAC. Flow: the agent **proposes** a typed action → a person with **Approve agent actions** approves/rejects → a domain handler **executes** it through the normal write path → the action is recorded with a reversal so it can be **rolled back in one click**. Every step is written to an append-only audit trail. **Cost ceilings** (per-day/month run or dollar limits, org-wide or per agent) refuse runs once reached.

- **Agents** page: create/configure agents, grant tools (each carries a risk level + reversibility), set the org cost ceiling, and "Generate sample proposal" to demo the flow without an LLM key. A one-click **Add starter agents** provisions a ready-made pack (Task Assistant, Onboarding Helper, Expense Categorizer, Support Triage, Pipeline Mover), pre-wired with tools. A **Find work in my data** button (Accounting/Tasks/CRM) deterministically scans real records and proposes concrete actions **with no LLM key** — the key only adds free-form NL requests.
- **Agent approvals** page: the queue of proposed actions — review payload + audit, then Approve / Reject / Roll back.
- **Agent activity & ROI** page: read-only dashboard of the time and money agents save — actions executed, estimated time saved, dollar value created (at a configurable blended rate) net of metered agent cost, reliability (rollback rate), and a per-domain value breakdown over a 7/30/90-day window. Headline figures come from the RLS-gated `agent_roi_summary` rollup (accurate over all rows, not the 200-row client fetch); the value math lives in `lib/agentRoi.ts` (transparent + tunable). Visible to agent managers/approvers (`can_see_agent_ops`).
- **Permissions** (Roles): *Manage agents* (configure) and *Approve agent actions* (approve/reject/roll back); owners & admins hold both.
- **Policy memory (Phase 3.6 — learns each tenant)**: every human approve/reject trains a per-tenant, per-action-type memory (`agent_policy_memory`, RLS member-read / SECURITY DEFINER-write, fail-closed). New proposals are stamped with a learned priority (`agent_policy_score`) and the **Agent approvals** queue is ranked by it — the kinds you usually approve rise, the ones you usually reject sink. A **Signal** column (Usually approved / Often rejected / Learning / New) and a per-proposal “Learned from your history” panel make it transparent; admins can **Reset learning** for any action type (`agent_policy_reset`, manage-gated). Ranking + transparency only — approve-first is unchanged, and auto-approvals never train it.
- **Noise control (Phase 3.7 — opt-in suppression)**: an org can turn on **Noise control** (top of *Agent approvals*, *Manage agents*-gated) so agents **stop autonomously proposing** verbs the tenant chronically rejects. Governed by `agent_policy_config` (per-org singleton: `auto_suppress`, `suppress_threshold` 0.34, `suppress_min_n` 5; RLS member-read / SECURITY DEFINER-write via `agent_policy_config_set`, fail-closed) and resolver `agent_policy_suppressed(org,verb)` (muted only when opted in **and** `n >= min_n` **and** learned score `<= threshold`; unseen verbs never muted). Enforced at the **source**: `agent_sensors_run` skips a muted verb's scan entirely (zero query + zero LLM-enrich cost). Suppression is applied **only to unsolicited background sensing** — the LLM proposer and *Find work* scanner still surface everything. Fully reversible (toggle off → suggestions resume; already-queued items are untouched); nothing is ever auto-approved/executed.
- **Transactional preflight (Phase 2 — will it run?)**: opening a *proposed* create/composite action runs `agent_preflight_action(action)` — a **SECURITY INVOKER** RPC that replays the representative writes **as the approver** (RLS/RBAC/page-CRUD/CHECK/FK/triggers all enforced) inside a subtransaction, then force-aborts it (`raise P0001 PREFLIGHT_ROLLBACK`) so **zero rows persist and no webhook/audit escapes** (pg_net + audit inserts roll back too). Returns `{ok, checked, creates|reason}`; the modal shows a green *Verified* or red *Would fail if approved* (mapped reason) and **disables Approve when it would certainly fail** — closing the “approved then errored” gap. Covers `scaffold_client_onboarding` / `scaffold_project` / `create_contact` / `create_deal` / `create_task`; other tools return `checked:false` and fall back to the client dry-run. Approve-cap/manage gated; outsiders fail closed (RLS hides the row). Verified: owner allow, outsider `not_found_or_no_access`, zero persistence, advisors clean.
- Real (LLM-driven) proposals require a provider key under **Console ▸ AI assistant**; until then the substrate, queue, audit, rollback and ceilings all work on manually-generated sample proposals.
- **Graduated autonomy (Phase 3.5)**: set an agent to **Auto low-risk** and its low-risk, reversible actions auto-execute with no approval click (money/payroll and any medium/high-risk action always wait). The auto-approval is policy-gated server-side (`agent_auto_approve`: only an enabled `auto_low_risk` agent, only a low-risk reversible action); execution still runs as the user via RLS; every action is audited + one-click reversible; cost ceilings still apply.
- **Metered billing → reseller margin (Phase 3.4)**: agent **runs + tokens** are metered per workspace (day/month). The platform sets a **wholesale** rate (Console ▸ Billing ▸ AI agent billing); a **reseller** sets a **retail** rate for its sub-tenants (Reseller ▸ Plans & features) and keeps **retail − wholesale** as margin. Each tenant sees its own estimated agent cost on the Agents page. Compute + visibility only — turning the rollup into a real Stripe charge is **3.4b** (gated on Stripe Connect). Rates default to 0/disabled until a platform admin sets them.

## Automations (engine + log)
Event bus + rules engine. DB trigger `events_run_automations` → `run_automations()` (SECURITY DEFINER, **fully defensive**: per-action `exception…null` + outer `exception…return NEW` + loop-guard `snrpmo.in_auto`) matches `automation_rules` where `org_id=NEW.org_id and active and trigger_type=NEW.type`, ANDs `match` (key=value over `events.payload`), runs `actions[]` (notify / set_status / assign / create_task), bumps `last_fired_at`/`fire_count`, and (F1) writes one **`automation_logs`** row per fired rule (RLS staff-read, append-only via the engine — no app insert grant). Real emitted triggers: `task.created`, `project.created`, `deal.created`, `client.created`, **`form.submitted`** (F2). UI `/automations` (`pages/automations.tsx`, owner/admin only, `feature:'automations'`): builder = trigger + **multiple conditions** + **multiple actions** + a **Recent-activity (log)** panel. FLAGGED follow-up: emit `deal.won`/`invoice.paid`/`deal.stage_changed` (need deal/invoice write-path event hooks). Docs `/docs#automations`.

## Forms & lead capture
Build-once forms with a public hosted page + iframe embed. Tables `snrpmo.forms` (org_id, name, **slug UNIQUE global**, status draft/published/archived, `fields` jsonb `[{key,label,type,required,options}]`, `settings` jsonb, submit_count) + `form_submissions` (form_id, org_id, data jsonb, lead_id, source). UI `/forms` (`pages/forms.tsx`, **ListView**): field builder + status + settings (submit label / success message / redirect / new-lead status) + Share&embed (public link + `<iframe>`). Public page `pages/f/[slug].tsx` (standalone, **no Layout → public**; self-contained inline styles; white-label-neutral; `noindex`). Security: anon never touches tables — `form_public_get(slug)` (SECURITY DEFINER) returns only a published form's renderable projection (strips `settings.lead_status`); `form_submit(slug,data,source)` (SECURITY DEFINER, anon EXECUTE) validates required + published-only + ≤60 keys, writes the submission, creates a CRM **lead** (email/phone/name mapped by field type, source `form:<name>`), and inserts an `events` row `form.submitted` → the `run_automations` trigger fires matching rules. Org is derived from the form row (no cross-tenant). RLS: staff read forms/submissions; creator/owner-admin write forms; submissions are write-only via the RPC, owner/admin delete. Plan-gated `forms` (all plans); nav under CRM. Docs `/docs#forms`.

## Drives & files
Per-tenant cloud storage: `drives` → `drive_folders` (nested via `parent_id`) → `drive_files`, stored in the private `drives` bucket. UI at `/drives` (`pages/drives.tsx`): a multi-drive list, a **nested collapsible folder tree** + clickable breadcrumbs, upload/download, and **move** (folder→folder/root, file→folder/root) with a client-side cycle-guard so a folder can't move into its own subtree. **Drag-and-drop** (rows→folder/tree/breadcrumb to move; OS files→pane/folder to upload) and **in-browser preview** (image lightbox + PDF iframe via signed URL) added 2026-06-24. **In-app documents** (`kind='doc'`, rich-text HTML in `drive_files.content` via the reused `RichText` component; migration `f5_drive_doc_content`) — create/edit governed by the same `drive_files` RLS (creator or owner/admin); RLS-sim PASS. A drive can be linked to a project (`drives.project_id`) to expose its files read-only in that project's **client portal** (guest RLS via `can_access_project`). RBAC: any staff can read/upload (`is_org_staff` + `tenant_can('drives')`); rename/move/delete are gated to the creator or owner/admin by the `drive_*_upd`/`_del` policies — `moveFolder`/`moveFile` are plain UPDATEs (no RETURNING) so RLS enforces the gate. Plan-gated (`drives` feature); storage counts toward the plan quota (`drive_usage`). **All-drives search** (PR#43): the left-column search box queries org-wide `drive_files`/`drive_folders` (RLS-fenced) across every accessible drive, with advanced filters (type/owner/date); each result shows its owning drive and deep-links into it. **Shared tab** (PR#45, `components/DriveSharedView.tsx`): a manager-only per-drive access surface — people/role grants + share links (all scopes) + client-portal link, with revoke/copy/re-share/bulk-revoke; reuses the manage-gated db helpers so it can only ever read/revoke what the signed-in manager may (`drive_can(drive_id,'manage')`). **Trash tab** (PR#47, `components/DriveTrashView.tsx`): soft-deleted (`archived_at`) folders/files with Restore + Delete-forever + Empty-trash — "delete" is now "Move to trash" first. Manage capability (`drive_level`='manage') = the drive's creator, an org owner/admin, or an explicit manage grant. **Server-side search**: all-drives search calls `drive_search_files`/`drive_search_folders` (SECURITY INVOKER `SETOF` RPCs — RLS stays the wall) with org scope + text/owner/recency filters + a hard 500-row cap, replacing the prior unbounded client-side `select('*')` over the whole org (no LIMIT → egress/memory cost + silent PostgREST row-cap truncation); the UI debounces input and shows a 'first 500' note when capped (migration `drive_search_rpc`; RLS-sim member-ALLOW / cross-tenant+anon-DENY). **Virus-scan badge**: the file list + all-drives search show each stored file's scan state from `file_scans` (org-staff RLS read) — clean (shield) / `Scanning…` (no terminal record yet) / `Blocked` (infected|error). Display only; the real wall is the `obj_scan_clean_gate` RLS download gate. Native docs/sheets/slides have no storage object so aren't badged. Docs: `/docs#drives`.

### Upload malware scanning (file-upload P0, 2026-06-30)
Every file upload (drives, attachments, employee-docs, training-docs, guest-uploads) is gated by `file_register` (RBAC `is_org_staff` + dangerous-type block via `file_upload_blocked`) then the `scan-file` edge fn: a structural magic-byte check **always** runs (blocks PE/ELF/Mach-O/shebang); **Cloudmersive AV** runs when scanning is enabled. The AV key + enable flag live in `file_scan_config` (**fail-closed: deny-all RLS, never client-readable**; env `CLOUDMERSIVE_API_KEY` overrides). Client uploads route through `assertUploadClean()` which is **FAIL-CLOSED — only a confirmed `clean` verdict is saved**; `pending`/`error`/`infected` reject the upload and remove the stored object. Verdicts persist in `file_scans` (RLS staff-read; `file_set_scan` definer-write). Platform admins manage it via secret-safe `file_scan_get_config` / `file_scan_set_config`. Verified end-to-end on the live scanner: EICAR → `infected (cloudmersive: Eicar-Test-Signature)` + auto-removed; benign → `clean`. **Download gate (server-enforced):** the RESTRICTIVE `storage.objects` SELECT policy `obj_scan_clean_gate` now requires a `clean` `file_scans` row for **all five** scanned buckets (drives, attachments, guest-uploads, employee-docs, training-docs) — a non-clean object is un-downloadable (RLS-sim proven allow/deny/cross-tenant; pre-existing objects backfilled `clean` + queued for a real re-scan). **Self-healing sweep** (`scan-sweep` edge fn + `file_scan_sweep_kick` cron, every 10 min) re-scans any object missing a scan row, stuck pending/error, or backfilled-but-unscanned, so nothing stays silently blocked. **Cost cap** (`file_scan_av_claim`): per-org/day + global/day Cloudmersive ceilings (defaults 2000/20000) claimed before each AV call — fail-closed over cap (held, never marked clean) with an org-admin alert. **Quarantine UI** at Administration ▸ File security (`pages/admin/quarantine.tsx`): owners/admins review their org's flagged files, platform staff see all tenants; actions = Re-scan (routes through the capped sweep) and Delete/Dismiss — no manual "mark clean". Platform staff toggle AV, rotate the key, and tune caps from the API-keys page. Docs `/docs#file-security`.

## Screen recordings (Work ▸ Screen Recordings, feature `recordings`, GA 2026-07-01)
Web-native screen capture — `getDisplayMedia` + `MediaRecorder` in the browser (no plugins) → private `recordings` storage bucket → signed-URL playback. Metadata in `snrpmo.screen_recordings` (forms-pattern RLS: `is_org_staff` SELECT; creator INSERT + `tenant_can('recordings')`; creator-or-owner/admin UPD/DEL; RESTRICTIVE `page_allows('/recordings',…)`). Storage.objects RLS scopes read/write to the `<org_id>/<user_id>/…` path (authenticated staff only; anon revoked). Caps: 10 min / 200 MB per clip (client-enforced + bucket `file_size_limit`); recordings count toward the org storage meter (`drive_usage`). Optional microphone mixing via Web Audio. Delete = own always, any as owner/admin. Slice 3 SHIPPED: auto poster **thumbnails** (client canvas capture, scanned) + **attach-to-task** (`screen_recording_links`, forms-pattern RLS, cascades from recording/task) + **malware-scan hardening** (recordings bucket now in RESTRICTIVE `obj_scan_clean_gate` + ingest `assertUploadClean` fail-closed + self-healing sweep covers recordings/social-media).

## Modules (self-select)
Settings ▸ Modules lets an **owner/admin** turn modules (CRM, HR, Accounting, Time tracking, Support, Client portal, …) **on or off for the whole workspace**. Off = hidden everywhere (sidebar/search/menus); data is kept and the module can be re-enabled anytime. You may enable any module **your plan includes**; out-of-plan modules show locked ("Upgrade to enable"). Enforced server-side by `snrpmo.org_set_module(p_org,p_feature,p_enabled)` (owner/admin gate; enabling requires the plan to grant the feature — **never bypasses billing**; disabling always allowed). Effective set flows through `org.features` → `hasFeature` so nav/gating follow automatically. **Per-page visibility:** owner/admin can also hide individual pages (not whole modules) via the eye toggles in the Settings ▸ Modules tree; hidden hrefs persist in the ungated `organizations.hidden_pages` jsonb (written via the same `org_update` RLS as `fab_shortcuts`/`theme_skin` — no white-label gate, since `trg_white_label` only guards `branding`), and are filtered in `lib/nav` `isPageHidden` + `components/Layout` + global search. Visibility only — RLS stays the wall. Docs: `/docs#modules`.

## Performance appraisals
People ▸ Appraisals runs structured performance reviews. Work is grouped into **cycles** (e.g. "H1 2026 Review", status draft/active/closed); each employee gets one **appraisal** per cycle (`unique(cycle_id,employee_id)`) with a reviewer, status (pending→self_review→in_review→completed), overall rating (0–5) and a summary. Tables `appraisal_cycles` + `appraisals` (schema snrpmo), RLS: employee/reviewer see their own; owner/admin or the `can_manage_appraisals` cap manage all. Feature key `appraisals` (mirrors `hr` plan grants; self-selectable in Settings ▸ Modules). RBAC: "Manage performance appraisals" (`can_manage_appraisals`) on Administrator/Owner/HR Manager. Page renders through the shared ListView (status groups, export, admin-gated delete). Docs `/docs#appraisals`.

## AI fields (smart custom columns)
Custom-column type `ai` (palette group "AI", in `useCustomColumns`/`AddColumnForm`). Config in `custom_field_definitions.option_meta` (`ai_transform` = summarize|categorize|sentiment|custom, `ai_prompt` for custom; categories reuse `options`). Per cell a ✨ Generate/↻ button calls `db.computeAiField` → edge fn **`ai-field`** (key-gated via shared `assistant_config`; **no business writes** — read-only, returns text) → the client upserts the value to `custom_field_values` under RLS. Source text built generically by `ListView` from the row (`aiRowText` → `prefs.cf.setAiText`), so it works on every list with zero page wiring. Manage-gated (only users who can add columns see Generate). No key → `{configured:false}` → UI prompts to connect one. Docs `/docs#ai-fields`. Follow-up: per-page richer `aiText`, batch "fill column", usage metering.

## Shortcuts button (FAB)
A floating, draggable round button (bottom-right, every page) is the quick-actions launcher — `components/ShortcutsFab.tsx` (replaces the notes-only FAB; rendered once in `Layout`). Click → a menu of admin-enabled shortcuts: **Quick notes** (the existing sticky-notes panel), **Check in / out** (the `attendance` check-in/out path; green dot while open), **Team chat** (opens the slide-in panel via a `snr:open-chat` window event Layout listens for), **New task** (`/tasks`), **Calendar** (`/calendar`). Per-user: drag to reposition + hide (localStorage, unchanged). Admins choose the workspace-wide set in **Settings ▸ Themes ▸ Workspace shortcuts**, stored on `organizations.fab_shortcuts` (jsonb; ungated `org_update` RLS, same path as `theme_skin`; `db.setOrgFab`; null = default `notes/checkin/chat/task`). Not a plan feature (always-on UI). Docs `/docs#shortcuts`. Follow-up: geolocation + running timer on check-in (footer/check-in slice), an "Ask AI" shortcut once a general-user assistant surface exists.

## Footer & check-in (running timer + geolocation)
A slim global footer (`components/AppFooter.tsx`, mounted once in `Layout` under the page content) shows the live date/time and, while you are checked in, a **running "On the clock" timer** with a map-pin when a location was captured. Check-in/out is centralised in **`lib/attendance.ts`**: `getGeo()` requests **best-effort browser geolocation** (resolves null on denial/timeout — check-in is never blocked), `performCheckIn(me,org)` calls `db.checkIn` (now stores `attendance.check_in_lat/lng/accuracy`), notifies the user's **reporting manager** (`users.reports_to`) via the existing `notify()` SECURITY-DEFINER RPC (type `SYSTEM` → manager's bell + bottom-right toaster), and broadcasts `snr:checkin`; `performCheckOut(row)` broadcasts `snr:checkout`. The footer and the **bottom-left confirmation popup** (`components/CheckInPopup.tsx`) listen for those events. Both the Shortcuts-FAB check-in action and `pages/attendance.tsx` route through these helpers. Migration `attendance_checkin_geolocation` adds the 3 geo columns (+ column INSERT grant). Privacy: location is opt-in per browser permission and only stored when granted. Docs `/docs#shortcuts`. Follow-up (flagged): per-org "require location" toggle + a configurable notify target; reverse-geocoded place label + a map link on the attendance row.

**Update — Ask AI shortcut:** the Shortcuts-FAB catalog now includes an **opt-in `ask` action ("Ask AI")** that opens the globally-mounted `HelpAssistant` via a `snr:open-assistant` window event (the assistant un-hides + opens). **Update 2026-06-24:** `Ask` is now a permanent button built into the single FAB cluster (sparkles + "Ask", beside the bolt launcher); `HelpAssistant` no longer renders its own standalone launcher, so there is exactly one floating control with no duplicate Ask. Not in the default set — admins enable it in Settings ▸ Themes ▸ Workspace shortcuts.

## Relationship custom field (link records)
A new custom-column type **`relationship`** (group "Connect" in the "+ add column" palette) links each row to a record from another module. Config: `custom_field_definitions.option_meta.relation_entity` = one of `projects | clients | deals | contacts | tasks | people` (chosen in `AddColumnForm`); the cell value (`custom_field_values.value`) is the **referenced row id**. Rendering + editing live in `components/useCustomColumns.tsx`: `db.getRelationOptions(org, entity)` loads the target rows (RLS-scoped, 500 cap) → the cell shows the resolved **name as a pill linking to the module** (`REL_HREF`; tasks deep-link `/tasks?task=`), and inline editing reuses the existing **select** editor populated with those rows. Targets registry = `db.RELATION_SOURCES` (table + label col) / `db.RELATION_ENTITIES` (picker). **People** is special-cased (`users` has no `org_id` → loaded via `org_members!inner(org_id)` in both `getRelationOptions` and `getRollupValues`): its inline editor is the avatar **PersonPicker** (`EditSpec type:'person'`, searchable, single-select) and the cell renders an **Avatar + name** linking to `/users/<id>`; rollup targets for People = email/role/department. No migration (a `relation_entity` value, not a constrained `field_type`). **Multi-link:** `option_meta.multi='1'` (AddColumnForm “Allow multiple”) stores the cell value as a **comma-joined list of ids**; the editor becomes multi-select (PersonPicker `multi` for people, `EditSpec {type:'select', multi:true}` → Dropdown `multiple/onToggle` for records via a new branch in `DataList.EditableCell`), and the cell renders up to 4 pills/avatars + `+N`. Single-link (default) unchanged. Migration `custom_field_type_relationship` adds `relationship` to the `field_type` CHECK (and it's in BOTH `CustomFieldDef.field_type` TS unions). RLS-sim: owner creates a relationship def ✓, non-member blocked ✓. Docs `/docs#ai-fields` (Relationship callout). **Foundation for Rollup + Formula** (aggregate / compute from the related record) — flagged follow-ups, plus People/Files/Tasks-list field types and a searchable record picker + true per-record deep links.

## Rollup custom field (value from the linked record)
A custom-column type **`rollup`** (group "Connect" in "+ add column") surfaces a field from the record a **relationship** column links to. Config in `option_meta`: `rollup_source` = the relationship field def's id, `rollup_target` = a whitelisted column on that relationship's target entity. Whitelist = `db.ROLLUP_TARGETS` (per entity: e.g. projects→status/priority/progress/end_date, deals→stage/value/expected_close, tasks→status/priority/estimated_hours/actual_hours/due_date). `db.getRollupValues(org, entity, field)` loads `{ linked-id → value }` for the org (RLS-scoped, 1000 cap; the interpolated column is whitelist-guarded against injection). In `components/useCustomColumns.tsx` the cell resolves this row's linked id from the source relationship value, looks up the target value, and renders it **read-only** (number/date formatted) — no inline editor (skipped like `ai`). Picker UI in `AddColumnForm` (pick relationship field → pick target field; prompts to add a Relationship field first if none). v1 is a single-record **lookup**; true aggregations (sum/avg/min/max) arrive when a relationship column can hold multiple links. Migration `custom_field_type_rollup` adds `rollup` to the `field_type` CHECK (and BOTH `CustomFieldDef.field_type` TS unions). Docs `/docs#ai-fields` (Rollup callout). **Foundation for the Formula field** (compute across columns, can reference a rollup). RLS-sim: owner creates a rollup def ✓ (CHECK accepts `rollup`). **Aggregation:** `option_meta.rollup_agg` (show|count|sum|avg|min|max|list) — `rollupCompute` follows the source relationship's id(s), looks up each target value, and combines them (numeric sum/avg/min/max for number kinds; count of links; list/min/max for text/date). Single-link → `show` (unchanged). Makes multi-link rollups powerful (e.g. link many Deals → **sum** their value).

## Demo: sample smart columns (make the depth visible)
Settings ▸ Demo data ▸ **Add sample smart columns** seeds 4 advanced columns on the **Clients** list so a workspace SHOWS the custom-field depth alive (invisible otherwise until someone adds columns): **Account owner** (People relationship), **Open deals** (multi-link → Deals), **Pipeline value** (Rollup = **sum** of those deals' `value`) and **Est. fee** (Formula `{Pipeline value} * 0.1`). Reversible SECURITY-DEFINER RPCs `seed_demo_smart_columns(p_org)` / `unseed_demo_smart_columns(p_org)` (owner/platform-gated, idempotent; values cascade-delete via the `field_id` FK); `db.seedDemoSmartColumns` / `unseedDemoSmartColumns`; UI in `components/DemoDataCard.tsx`. The flagship **snr** org is seeded live (42 clients) so the public demo shows e.g. a client with 3 linked deals → Pipeline value **$75,000** → Est. fee **$7,500**. Migration `demo_smart_columns_seed`.

## Formula custom field (compute from other columns)
A custom-column type **`formula`** (group "Advanced" in "+ add column") computes a read-only value from the row's other columns. Config = `option_meta.formula` (the expression string). The engine is **`lib/formula.ts`** — a pure, dependency-free **hand-written tokenizer + precedence-climbing parser + tree-walking evaluator** (NEVER `eval`/`Function`; honours the no-unsafe-exec posture): numbers, string literals, `{Field name}` refs, operators `+ - * / % ^` + comparisons (`= == != <> < <= > >=` → 1/0), and functions SUM/AVG/MIN/MAX/ROUND/ABS/CEIL/FLOOR/SQRT/IF/CONCAT/LEN/UPPER/LOWER/TRIM. `evalFormula(expr, resolve)` NEVER throws — parse/eval errors return `{error}` (cell shows a red `#ERR` with the message in its tooltip); blank/unknown refs resolve to null and count as 0 in math, divide-by-zero and text-in-math are errors. In `components/useCustomColumns.tsx` the read-only cell evaluates with a resolver (`resolveFormulaRef`) that maps `{Field name}` (case-insensitive) → stored custom-field value, **Rollup** value, or a **nested Formula** (re-evaluated with a `visited` set for cycle-safety); result rendered number/string-formatted with a `ti-math-function` marker (skipped in the editable loop like `ai`/`rollup`). Picker UI in `AddColumnForm` = expression textarea + one-click field-token inserter + function hint; Add disabled until non-empty. 36 engine unit tests pass (precedence, right-assoc `^`, every function, refs, blank=0, and all error paths). Migration `custom_field_type_formula` adds `formula` to the `field_type` CHECK (and BOTH `CustomFieldDef.field_type` TS unions). Docs `/docs#ai-fields` (Formula callout). **Completes the computed-columns trio** relationship → rollup → formula. v1 references custom fields + rollups (not base table columns — flagged follow-up). RLS-sim: owner creates a formula def ✓ (CHECK accepts `formula`).

## Account/workspace lifecycle & feedback (2026-06-30)

**Tenant lifecycle (soft-delete/archive).** `organizations` carries `deleted_at` (+ `deletion_*` columns). The central RLS predicates `is_org_member`/`is_org_role` require `deleted_at IS NULL`, so archiving a tenant fences all its data from members across every table at once; platform/reseller access is via SECURITY DEFINER RPCs. Archive = secure retention (no hard drop).
- Self-service (owner): `request_account_deletion` (email-verify token) → `confirm_account_deletion` (starts 30-day grace, `deletion_scheduled_for`) → `cancel_account_deletion` (any time in window). `process_scheduled_deletions()` cron (daily) archives elapsed workspaces with a snapshot. `account_deletion_status` powers the Settings banner.
- **Continuous social sensor (Phase 3G):** `agent_sensors_run` has a `marketing` branch — a sense-enabled marketing agent autonomously proposes `analyze_social_performance` + `watch_competitors` insights on the existing */15m `agent-sensors-tick` cron (weekly-deduped via `agent_already_proposed`, cost-ceiling-enforced, approve-first). GOTCHA fixed: `agent_definitions_domain_check` lacked `marketing` (enum CHECK drift) → marketing agents were un-provisionable; now allowed.
- **Social Analytics (Phase 3C, `/social/analytics`):** `social_post_metrics` (per post/channel, generated `engagement`) + `social_channel_metrics` (follower time-series). Reads via SECURITY INVOKER aggregation RPCs (`social_analytics_overview`/`_channel_stats`/`_top_posts`/`_engagement_trend`, RLS-scoped + capped + indexed); writes via SECURITY DEFINER `social_record_post_metrics` (org from post, staff-gated; dispatcher uses service_role). Tables: staff-read RLS, no write grant, anon revoked. RLS-sim allow/cross-tenant-0/direct-write-denied/anon-denied PASS; advisors clean. Dashboard: KPIs + inline charts + top posts + `AgentPanel(marketing)`. Full blueprint: `COMPETE_SOCIAL_PLATFORM_PLAN.md`.
- **Media Library (#32b):** reusable images/video/GIFs via 3 sources — device **Upload** (private scan-gated `social-media` bucket + `assertUploadClean` fail-closed), **From Drive** (references an already-scanned Drive file, no copy), and **Add by URL**. Private media shown via short-lived signed URLs; `social_media_assets` (+storage_path, source url|drive|upload). Storage RLS `<org>/…` staff-only + `obj_scan_clean_gate` covers `social-media`.
- **Agents-as-content-team (Phase 3B):** `draft_social_post` agent tool (marketing domain, low-risk, reversible) drafts into `social_posts` (status=draft, source=agent) via the same `createSocialPost` a human uses — runs **as the approving user**, so social-write RLS/RBAC apply; agent never bypasses. Approve-first; rollback deletes the draft. Surfaced as the **Content Assistant** starter agent + an `<AgentPanel domain="marketing"/>` on `/social`. Publishing stays a separate human/OAuth step.
- **Social & Content** (`/social`, Marketing menu, feature `social`, shipped dark via `feature_rollouts` stage `internal`): compose/schedule posts across channels (`social_channels`/`social_posts`/`social_post_channels`). Forms-pattern RLS (staff SELECT; `tenant_can('social')` INSERT; creator-or-admin UPDATE/DELETE; RESTRICTIVE `page_allows('/social')`); authenticated-only grants, anon fully denied. Live publishing pending per-platform OAuth; agent drafting is the next slice.
- **Reseller feature control:** a reseller curates which features each sub-tenant gets via `/reseller/clients/[id]` Features panel. Writes go ONLY through SECURITY DEFINER RPCs `reseller_set_sub_feature` / `reseller_sub_features` (`org_feature_overrides` has SELECT-only grant, no write policy). Server enforces: caller is owner/admin of the sub's reseller parent + may only ENABLE features `org_has_feature(parent)` (can't resell unowned); disabling always allowed. RLS-sim: allow / deny-unowned / deny-non-admin / direct-write-denied all PASS; advisors clean. Residual: reseller downgrade doesn't auto-revoke previously-granted sub overrides (reconcile sweep = follow-up).
- Operator consoles (Platform + Reseller) have **no in-page tabs**: every section is a sidebar entry, grouped by function via `NavItem.group` and rendered through the collapsible `Menu` (same as Administration). `/platform` landing = Plans & Features (the old `/platform/plans` nav link 404'd and was fixed to `/platform`).
- Platform console is decomposed into focused routes the same way: `/platform` (Console) + `/platform/{plans,billing,email,assistant,backups,errors,owners,rollout,campaigns,activity}` (thin re-exports of `pages/platform.tsx`, section from `router.pathname`); the in-page tab bar navigates; legacy `/platform?tab=` redirects. Curated set surfaced in the Platform sidebar (Console, Plans & Features, Billing, Feature Rollout, Campaigns, Reliability + Insights, Tenants). All gated by the page's `platformAdmin` guard (operator-only; not in tenant MODULE_GROUPS) — no RLS/RBAC change.
- Reseller console is decomposed into focused routes: `/reseller` (Console), `/reseller/clients`, `/reseller/plans`, `/reseller/payments` (incl. landing/website + public signup), `/reseller/snapshots`, `/reseller/co-owners` — all surfaced in the Reseller sidebar menu; legacy `/reseller?tab=` redirects to the matching route. Same `is_reseller + manageMembers` guard + RLS on every route (no new permission surface).
- Platform/reseller: `tenant_archive`/`tenant_restore` gated by `can_manage_tenant` (platform admin OR reseller owner/admin of the parent); `tenant_lifecycle_state` is the read used by the tenant/client detail pages. Recovery after archive = `tenant_restore`.

**Feedback.** `snrpmo.feedback` (RLS-as-wall: submitter + org owner/admin see their org; platform via `platform_feedback_list`). `submit_feedback` is throttled (5/10min) + payload-capped + member-only; `feedback_triage` is org-admin|platform. UI = app-wide `FeedbackWidget` (capture) + `/feedback` admin triage page.
