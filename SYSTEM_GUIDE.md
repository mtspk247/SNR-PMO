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
- Aggregated KPIs: open projects, overdue tasks, pipeline value, net ledger balance, headcount.
- Entry point for daily situational awareness; links to all key sub-pages.

### Work

| Module | Key capabilities |
|---|---|
| **Companies** | Client/vendor registry. Linked from Projects and CRM. |
| **Portfolios** | Group projects for programme-level tracking. Optional per project. |
| **Projects** | Core delivery unit. Detail page: Tasks, Risks, Financials, Ledger, Discussion. Linked to Company and Portfolio. |
| **Tasks** | Subtasks, followers, @mention comments, color tags, **checklists**, **time tracking** (live timer + manual log), **recurring schedules** (daily/weekly/biweekly/monthly), **reminders**, and **team assignment**. Assignable across project members. |
| **Ideas** | Pitch board with voting. Any org member can submit; managers convert winning ideas to Projects. |
| **Chat** | Org-wide General channel + auto-created per-project channel. **@mention** people, **#link** tasks/projects, **/remind**. 12s polling. No external dependency. |
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
| **Roles** | Role templates. Editing a template propagates permission changes to all users on that role. |
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
- **Webhooks**: add an endpoint (Developer ▸ Webhooks), pick events or `*`. Each delivery carries `X-SNRPMO-Signature: sha256=` + HMAC-SHA256(rawBody, endpointSecret). Events: `task.created`, `project.created`, `deal.created`, `deal.stage_changed`, `deal.won`, `invoice.created`, `invoice.paid`, `client.created`. Slack/Teams/Discord endpoints receive formatted messages instead of raw JSON.
