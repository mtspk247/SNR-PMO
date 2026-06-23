// ---------------------------------------------------------------------------
// lib/docs.ts — THE SINGLE SOURCE OF TRUTH for in-app documentation.
//
// This module owns the structured `SECTIONS` content. It is imported by BOTH:
//   • pages/docs.tsx          — renders the /docs guide (+ in-page search)
//   • components/HelpAssistant — grounds every AI answer in the live SECTIONS
//
// Because the AI help assistant retrieves and grounds on THIS array at query
// time (never a snapshot/embedding/static prompt), editing or adding a section
// here keeps the assistant current automatically — no retraining, no rebuild.
// The CLAUDE.md feature-propagation rule mandates updating SECTIONS on every
// feature change, so the assistant stays in lockstep with the product.
// ---------------------------------------------------------------------------

export type BulletItem = { text: string; sub?: string[] };
export type TableRow = string[];

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: BulletItem[] }
  | { kind: 'table'; headers: string[]; rows: TableRow[] }
  | { kind: 'steps'; items: { title: string; body: string }[] }
  | { kind: 'callout'; icon: string; text: string };

export type Section = {
  id: string;
  title: string;
  icon: string;
  blocks: Block[];
};

export const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: 'ti-rocket',
    blocks: [
      { kind: 'p', text: 'New here? This is the short path from an empty workspace to a working one. Each step links to where it lives in the app. You can do them in any order, but this sequence works best. Nothing here is permanent — you can change everything later.' },
      { kind: 'steps', items: [
        { title: '1. Complete your business profile', body: 'Open Settings ▸ Profile. Fill in your contact details, industry, address and tax/registration numbers. A progress card at the top shows how much is done. This information is printed on your invoices, proposals and emails, so it is worth doing first.' },
        { title: '2. Invite your team', body: 'Go to Users. Invite the people who will use the workspace. Each person gets their own login. You can group them into Teams (Users ▸ Teams) for assignment and visibility.' },
        { title: '3. Give everyone the right access', body: 'Still in Users, click a person to open their detail page, then the Access & roles tab. Assign a role template (a ready-made set of permissions) or switch individual permissions on/off. Roles are managed in the Users ▸ Roles tab.' },
        { title: '4. Choose your plan', body: 'Open Billing. Compare plans, upgrade with a card through secure Stripe checkout, and turn Auto-renew on so the plan continues automatically. Your plan and its renewal date also show under the workspace name in the sidebar.' },
        { title: '5. Connect your email', body: 'In Users, click your own name, then the Email tab. Add the mailbox you want reports and automations to send from (custom SMTP, or Gmail with an App Password). Your credentials are stored securely and never shown back.' },
        { title: '6. Set your notifications', body: 'Admins set which notifications are required for everyone in Settings ▸ Notifications. Each person then tunes their own optional alerts on their user page (Notifications tab) or via the bell ▸ Notification settings.' },
        { title: '7. Tune lists & options', body: 'Open Settings ▸ Lists & options to customise the dropdowns used across the app — task priorities, income/expense categories, industries and more.' },
        { title: '8. Explore with demo data (optional)', body: 'Owners can load realistic sample data from Settings ▸ Profile ▸ “Generate demo data” to see every module populated. You can wipe it later from Settings ▸ Danger zone.' },
      ] },
      { kind: 'callout', icon: 'ti-bulb', text: 'Tip: the sidebar only shows modules your plan includes and your role allows. If you cannot see something, check your plan (Billing) and your role (Users).' },
    ],
  },
  {
    id: 'your-account',
    title: 'Your profile & account',
    icon: 'ti-user-circle',
    blocks: [
      { kind: 'p', text: 'Everything about your own account lives in one place: open Users and click your own name to open your detail page. The tabs across the top are your personal control panel.' },
      { kind: 'table', headers: ['Tab', 'What you do there'], rows: [
        ['Profile', 'Your name, job title / designation, phone and photo. This is how teammates see you.'],
        ['Access & roles', 'Your role and permissions (managed by an admin). You can see exactly what you are allowed to do.'],
        ['Email', 'Connect your own mailbox (SMTP or Gmail App Password) for sending reports and automations as you.'],
        ['Notifications', 'Switch your optional alerts on or off. Required ones are set by your admin and are locked.'],
        ['Security', 'Change your password — enter your current password, then your new one twice.'],
        ['Activity', 'A log of your recent actions in the workspace.'],
      ] },
      { kind: 'steps', items: [
        { title: 'Change your password', body: 'Users ▸ your name ▸ Security. Type your current password, then your new password twice, and Update. You stay signed in.' },
        { title: 'Connect your email', body: 'Users ▸ your name ▸ Email. Pick Custom SMTP or Gmail. For Gmail, create an App Password in your Google account (Security ▸ App passwords) and paste it — the host is filled in for you. Tick “Enable sending” and Save.' },
        { title: 'Set your photo', body: 'Users ▸ your name ▸ Profile ▸ Upload photo. A square image looks best.' },
      ] },
      { kind: 'callout', icon: 'ti-shield-lock', text: 'Your email password and SMTP secrets are stored encrypted on the server and are never displayed back to you or anyone else — you will see “•••• (unchanged)” when a password is saved.' },
    ],
  },
  {
    id: 'business-profile',
    title: 'Set up your business profile',
    icon: 'ti-building-store',
    blocks: [
      { kind: 'p', text: 'Your business profile is the identity of your workspace. It feeds your invoices, proposals, contracts and white-label emails, so completing it makes every document you produce look professional. Find it in Settings ▸ Profile. A completion card shows which sections are still missing, and the app keeps prompting until every section is filled. Workspace name and logo now live on this same tab.' },
      { kind: 'table', headers: ['Section', 'What goes here', 'Where it shows up'], rows: [
        ['Contact details', 'Website, contact email, phone.', 'Invoice & proposal headers, email footers.'],
        ['Industry & about', 'Your industry, category and a short description.', 'Tailors demo data and reporting; shown to operators.'],
        ['Business address', 'Street, city, region, postal code, country.', 'Invoices, contracts and legal documents.'],
        ['Tax & legal', 'Tax / VAT ID and company registration number.', 'Tax lines on invoices and credit notes.'],
        ['Social', 'LinkedIn, X, Facebook, Instagram links.', 'Optional branding on shared/public pages.'],
        ['Company details', 'Legal name, year founded, company size.', 'Documents and your operator/account record.'],
        ['Contact person', 'Primary contact name, role, email and phone.', 'Documents and account communication.'],
        ['Workspace & logo', 'Workspace name, subdomain and company logo (upload).', 'Sidebar, invoices/proposals and white-label emails.'],
      ] },
      { kind: 'callout', icon: 'ti-info-circle', text: 'You do not have to fill every field at once — a section counts as done as soon as its key fields are set, and the prompt disappears when all sections are complete.' },
    ],
  },
  {
    id: 'users-roles',
    title: 'Users, roles & permissions',
    icon: 'ti-users',
    blocks: [
      { kind: 'p', text: 'Open Users to see everyone in the workspace in one list — name, designation, role, team, company and status. Click any person to open their full detail page. Roles and access are managed there (the Access & roles tab) and role templates live in the Users ▸ Roles tab.' },
      { kind: 'bullets', items: [
        { text: 'Role templates vs custom permissions', sub: ['A role template is a saved bundle of permissions and module access you can apply to many people at once (e.g. “Project Manager”).', 'If no template is assigned, the individual permission toggles on the person’s Access tab become their effective access.'] },
        { text: 'Teams', sub: ['Group members into teams (Users ▸ Teams) for assignment, workload and visibility. A person can belong to more than one team.'] },
        { text: 'Status', sub: ['Set a person to Suspended to block access without deleting them; set back to Active to restore.'] },
      ] },
      { kind: 'steps', items: [
        { title: 'Invite someone', body: 'Users ▸ invite. They receive a link to set their own password and join the workspace.' },
        { title: 'Assign access', body: 'Click the person ▸ Access & roles ▸ choose a role template, or toggle individual permissions. Changes save immediately.' },
        { title: 'Build a role template', body: 'Users ▸ Roles tab ▸ create a template with the permissions and modules it should grant, then assign it to people.' },
      ] },
      { kind: 'callout', icon: 'ti-checks', text: 'The number of people you can add is your plan’s seat limit, shown on the Billing page and in the platform Tenants view (active members count toward seats; guests do not).' },
    ],
  },
  {
    id: 'billing-plans',
    title: 'Billing, plans & renewals',
    icon: 'ti-credit-card',
    blocks: [
      { kind: 'p', text: 'Open Billing (Administration) to manage your subscription. It shows your current plan, seats used, the features your plan includes, a comparison of all plans, your renewal date, your invoices, and your account history.' },
      { kind: 'bullets', items: [
        { text: 'Upgrade or renew', sub: ['Click Upgrade to a plan to open secure Stripe checkout — you review and confirm the charge there before paying.'] },
        { text: 'Auto-renew', sub: ['Toggle Auto-renew on the renewal card so your plan continues automatically at the period end. Turn it off to let it lapse.'] },
        { text: 'Expiry warnings', sub: ['When your plan is within ~30 days of expiry (and not auto-renewing), a flashing Renew / Upgrade prompt appears under the workspace name in the sidebar and links straight to Billing.'] },
        { text: 'Invoices & receipts', sub: ['Your payments are listed on the Billing page; download itemised PDF invoices and receipts from the secure billing portal (Manage billing / Invoices in portal).'] },
      ] },
      { kind: 'callout', icon: 'ti-user-star', text: 'Only the workspace owner can change the plan or open the billing portal. Admins can view billing; ask an owner to make changes.' },
    ],
  },
  {
    id: 'templates',
    title: 'Document templates',
    icon: 'ti-files',
    blocks: [
      { kind: 'p', text: 'Build branded, reusable documents once and use them many times — proposals, contracts, agreements, offer letters and emails. Find them under Administration ▸ Templates (owner/admin).' },
      { kind: 'steps', items: [
        { title: 'Create a template', body: 'Templates ▸ New template. Name it, pick a type (Proposal, Contract, Offer letter, etc.), and write the content with the rich-text editor (headings, lists, bold, links).' },
        { title: 'Add merge fields', body: 'Use “Insert field” to drop tags like {{client_name}}, {{company_name}}, {{amount}}, {{date}}, {{workspace_name}}. They fill in automatically when you generate a document for a specific client/deal.' },
        { title: 'Branded letterhead', body: 'Every template previews on your letterhead — your logo, workspace name, address and contact details (from Settings ▸ Profile) appear at the top automatically.' },
        { title: 'Reuse', body: 'Pick a template whenever you need that document. Keep several per type (e.g. a short and a detailed proposal) for different purposes.' },
      ] },
      { kind: 'callout', icon: 'ti-bulb', text: 'Set up your business profile and logo first (Settings ▸ Profile) so the letterhead on every document looks right.' },
    ],
  },
  {
    id: 'hierarchy',
    title: 'Tenancy & RBAC',
    icon: 'ti-sitemap',
    blocks: [
      {
        kind: 'p',
        text: 'Every piece of data belongs to an Org. Below that, projects can optionally belong to a Company and/or Portfolio. Row-Level Security enforces isolation — a user in one org can never see another org\'s data.',
      },
      {
        kind: 'table',
        headers: ['Layer', 'Roles'],
        rows: [
          ['Org', 'owner · admin · member'],
          ['Company', 'manager · member'],
          ['Portfolio', 'manager · member'],
          ['Project', 'manager · contributor · viewer'],
          ['Guest', 'external, project-scoped, seat-exempt'],
        ],
      },
      {
        kind: 'callout',
        icon: 'ti-user-plus',
        text: 'Guests are external collaborators invited to a single project. They are seat-exempt (do not count against your plan limit) and fenced: no access to the directory, HR, or finance, and they see only the projects shared with them. Invite one from any project detail page.',
      },
      {
        kind: 'callout',
        icon: 'ti-users-group',
        text: 'Teams group members for assignment and visibility. Create them under Users → Teams, then assign a team to tasks.',
      },
      {
        kind: 'callout',
        icon: 'ti-lock',
        text: 'Feature entitlements (CRM, HR, Risk, Financial, Portfolios, Integrations, Audit) are plan-controlled. Modules not in your plan are hidden from nav automatically.',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'ti-layout-dashboard',
    blocks: [
      {
        kind: 'p',
        text: 'The Dashboard is your daily starting point. It surfaces aggregated KPIs across the entire org.',
      },
      {
        kind: 'bullets',
        items: [
          { text: 'Open projects & overdue tasks at a glance' },
          { text: 'Pipeline value from CRM (if enabled)' },
          { text: 'Net ledger balance from Accounting (if enabled)' },
          { text: 'Headcount from HR (if enabled)' },
          { text: 'Tile links navigate directly to the relevant module' },
        ],
      },
    ],
  },
  {
    id: 'work',
    title: 'Work modules',
    icon: 'ti-briefcase',
    blocks: [
      {
        kind: 'table',
        headers: ['Module', 'What it does'],
        rows: [
          ['Companies', 'Client and vendor registry. Projects link here for reporting.'],
          ['Portfolios', 'Group related projects for programme-level tracking. Optional per project.'],
          ['Projects', 'Core delivery unit. Detail page: Tasks, Risks, Financials, Ledger, Discussion.'],
          ['Tasks', 'Subtasks, followers, @mention comments, color tags, checklists, time tracking, recurring schedules, reminders, and team assignment. Assignable across project members.'],
          ['Ideas', 'Pitch board with voting. Managers can convert a winning idea directly into a Project.'],
          ['Chat', 'Org-wide General channel + auto-created per-project channel. @mention people, #link tasks/projects, /remind, and #commands — type #task, #onboard or #expense (or custom admin-defined commands) and an agent proposes the action for your approval (configure them on the Agents page; approve-first is never bypassed). 12 s polling, no external dependency.'],
          ['Calendar', 'Month grid of task due-dates and approved/pending leave. Click any item to jump to it.'],
          ['Roadmap', 'Gantt timeline of projects grouped by portfolio, with progress overlay, today line, and an Unscheduled bucket for undated projects.'],
        ],
      },
      {
        kind: 'callout',
        icon: 'ti-bulb',
        text: 'Ideas → Projects: click "Convert to Project" on any idea. The new project is pre-populated with the idea\'s title and description.',
      },
      {
        kind: 'callout',
        icon: 'ti-clock',
        text: 'Productivity layer on Tasks: start a live timer (or log time manually), tick off checklist items, set a task to repeat (daily/weekly/biweekly/monthly — completing it spawns the next occurrence), and add personal reminders that fire as notifications.',
      },
    ],
  },
  {
    id: 'tracking',
    title: 'Tracking',
    icon: 'ti-chart-line',
    blocks: [
      {
        kind: 'table',
        headers: ['Module', 'What it does'],
        rows: [
          ['Risk Analysis', 'Per-project risk register. Probability × impact matrix. Feature-gated: risk.'],
          ['Financial Data', 'Per-project budget lines and actuals. Feature-gated: financial.'],
          ['Accounting', 'Org-wide ledger for income and expense, plus a P&L tab (6-month category × month matrix with CSV export). Payroll runs auto-post Salary entries on Processed/Paid. Feature-gated: financial.'],
        ],
      },
      {
        kind: 'callout',
        icon: 'ti-arrows-exchange',
        text: 'Payroll → Accounting is automatic: marking a payroll run Processed or Paid creates a Salaries ledger entry via a DB trigger. It is idempotent — re-processing does not double-post.',
      },
    ],
  },
  {
    id: 'crm',
    title: 'CRM',
    icon: 'ti-target-arrow',
    blocks: [
      {
        kind: 'p',
        text: 'The Sales Pipeline tracks deals through six stages: Lead → Qualified → Proposal → Negotiation → Won / Lost.',
      },
      {
        kind: 'bullets',
        items: [
          { text: 'Each deal links to a CRM Company and Contact' },
          { text: 'Activity log on every deal, company, and contact record' },
          { text: 'Custom fields on Deals, Contacts, and Companies — defined once, appear on every record of that type' },
          { text: 'Won deal → create Project directly from the pipeline view' },
        ],
      },
    ],
  },
  {
    id: 'hr',
    title: 'HR modules',
    icon: 'ti-heart-handshake',
    blocks: [
      {
        kind: 'table',
        headers: ['Module', 'What it does'],
        rows: [
          ['Onboarding', 'Templates: day-offset tasks + required docs + linked Training Docs. Apply a template to a hire to generate their checklist automatically.'],
          ['Employees', 'Staff profiles with avatars, lifecycle stage, a 30-day KPI tab (tasks/hours/attendance/leave), compensation history (monthly or hourly), custom fields, and org role link.'],
          ['Training & JDs', 'Training library (file/link uploads, category, department). Job Descriptions (summary, responsibilities, requirements). Both linkable from Onboarding templates.'],
          ['Payroll', 'Pay runs → "Load active employees" auto-builds payslips for every active employee (hours from time tracking, days from attendance, gross by pay type). Tagged bonuses + custom disbursements per slip. Processed/Paid posts net Salary to the Accounting ledger automatically.'],
          ['Attendance', 'Clock in/out per employee. Auto-checkout at 00:05 UTC catches forgotten clock-outs.'],
          ['Leave', 'Annual / sick / casual balances. Requests → delegated-approver flow → server-enforced decrement on approval.'],
        ],
      },
      {
        kind: 'callout',
        icon: 'ti-link',
        text: 'Onboarding templates link Training Docs by ID. When you update a training doc, all future hire checklists that reference it pick up the new version automatically.',
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    icon: 'ti-shield-cog',
    blocks: [
      {
        kind: 'table',
        headers: ['Module', 'What it does'],
        rows: [
          ['Users', 'Assign org roles; toggle per-user capability flags (can_*).'],
          ['Roles', 'Role templates. Editing a template propagates permission changes to all users on that role immediately.'],
          ['Integrations', 'Third-party connector catalog. Feature-gated: integrations.'],
          ['Audit Log', 'DB-trigger event stream covering 16 tables. Immutable. Feature-gated: audit.'],
          ['Settings', 'White-label branding: upload logo, set primary color → CSS theme tokens update live across the entire app with no rebuild.'],
        ],
      },
    ],
  },
  {
    id: 'connections',
    title: 'Module connections',
    icon: 'ti-arrows-exchange-2',
    blocks: [
      {
        kind: 'p',
        text: 'These wiring points are what make SNR-PMO a unified platform. Understanding them prevents data silos.',
      },
      {
        kind: 'table',
        headers: ['Source', 'Destination', 'Mechanism'],
        rows: [
          ['Payroll run (Processed/Paid)', 'Accounting ledger', 'DB trigger — auto-posts Salary entry, idempotent via payroll_run_id'],
          ['Onboarding template', 'Training docs', 'Checklist items link training doc IDs; docs surface in hire checklist'],
          ['Ideas', 'Projects', '"Convert to Project" creates a Project pre-populated from idea title/description'],
          ['CRM Deals', 'Companies & Contacts', 'Each deal belongs to a CRM Company and Contact record'],
          ['Projects', 'Companies & Portfolios', 'Projects optionally link to one Company and one Portfolio'],
          ['Leave approval', 'Leave balances', 'Server-side trigger decrements balance on approval; cannot be bypassed'],
          ['Role templates', 'User permissions', 'Template change instantly propagates to all users on that role'],
          ['Plan feature keys', 'Nav visibility', 'crm / hr / risk / financial / portfolios / integrations / audit gate entire sections'],
          ['Settings branding', 'Whole UI', 'Logo + primary color write CSS custom properties; white-label is live, no rebuild'],
          ['Recurring task (Done)', 'Next task instance', 'Completing a recurring task spawns the next occurrence and moves the repeat rule to the clone'],
          ['Time tracking + Attendance', 'Payroll', '"Load active employees" pulls logged hours and attendance days into each payslip'],
          ['Reminders + @mentions', 'Notification bell', 'Due reminders and chat mentions create notifications; clicking one deep-links to the task/leave/deal/employee'],
        ],
      },
    ],
  },
  {
    id: 'developer-api',
    title: 'Developer API & webhooks',
    icon: 'ti-code',
    blocks: [
      { kind: 'p', text: 'SNR-PMO exposes a REST API and outgoing webhooks so you can read and write your workspace data from your own code or no-code tools. Every request is scoped to your workspace by the API key, so you can never reach another workspace. Set both up under Developer.' },
      { kind: 'steps', items: [
        { title: 'Create an API key', body: 'Developer > API keys > Create. The full key (snrp_...) is shown once — copy it immediately. Send it on every request as a bearer token: Authorization: Bearer snrp_... Keys are workspace-scoped with read + write access; revoke any key instantly from the same screen.' },
        { title: 'Read data', body: 'Base URL: https://dkjdtyzjdkumnpdyezbs.supabase.co/functions/v1/api-v1. GET /api-v1/<resource> lists records (use ?limit= up to 200 and ?offset= to page); GET /api-v1/<resource>/<id> returns a single record.' },
        { title: 'Write data', body: 'POST /api-v1/<resource> creates from a JSON body, PATCH /api-v1/<resource>/<id> updates, DELETE /api-v1/<resource>/<id> removes. Only the documented fields are accepted and your workspace is applied automatically — you never send an org id.' },
      ] },
      { kind: 'table', headers: ['Resource', 'Access', 'Writable fields'], rows: [
        ['tasks', 'Read + write', 'name, status, priority, project_id, assignee_id, due_date, description'],
        ['projects', 'Read + write', 'name, status, company_id, pm_id, description'],
        ['deals', 'Read + write', 'title, stage (Lead/Qualified/Proposal/Negotiation/Won/Lost), value, company_id, contact_id, owner_id, expected_close, notes'],
        ['contacts', 'Read + write', 'full_name, email, phone, title, status, company_id, owner_id, notes'],
        ['accounts', 'Read + write', 'CRM companies: name, industry, website, phone, owner_id, notes'],
        ['companies', 'Read + write', 'Workspace companies (the Company layer): name, description'],
        ['invoices', 'Read only', 'Financial records cannot be written through the API'],
      ] },
      { kind: 'callout', icon: 'ti-info-circle', text: 'company_id on deals and contacts points to an accounts record (a CRM company), not the workspace companies layer. Create or look up the account first, then pass its id.' },
      { kind: 'p', text: 'Webhooks push events to your own URL the instant something happens, so you never have to poll. Add an endpoint under Developer > Webhooks, choose the events you care about (or All events), and each matching change sends a signed POST.' },
      { kind: 'table', headers: ['Event', 'Fires when'], rows: [
        ['task.created', 'A task is created'],
        ['project.created', 'A project is created'],
        ['deal.created', 'A deal is created'],
        ['deal.stage_changed', 'A deal moves to a different stage'],
        ['deal.won', 'A deal is marked Won'],
        ['invoice.created', 'An invoice is created'],
        ['invoice.paid', 'An invoice is marked paid'],
        ['client.created', 'A client is created'],
      ] },
      { kind: 'callout', icon: 'ti-shield-lock', text: 'Verify every delivery: the X-SNRPMO-Signature header is "sha256=" followed by the HMAC-SHA256 of the raw body using your endpoint secret. Recompute it and compare before trusting the payload. Slack, Teams and Discord endpoints receive a pre-formatted message instead of raw JSON.' },
      { kind: 'callout', icon: 'ti-refresh', text: 'Reliable delivery: a server-side dispatcher POSTs each event and records the real HTTP status. Failed or timed-out deliveries retry automatically with exponential backoff (up to 6 attempts); return any 2xx to acknowledge. Delivery status + attempts are visible under Developer > Webhooks.' },
    ],
  },
  {
    id: 'client-portal',
    title: 'Client portal',
    icon: 'ti-layout-dashboard',
    blocks: [
      { kind: 'p', text: 'The client portal gives the people you invite as guests a clean, branded home at /portal — your logo and colours, none of the operator tools. They sign in and see only what they have been given access to.' },
      { kind: 'bullets', items: [
        { text: 'Branded automatically — the portal inherits your workspace logo and colours (Settings > Branding); a reseller\'s custom domain shows their own brand.' },
        { text: 'Scoped by access — a guest sees only the projects they were invited to. Row-level security enforces this on the server, not just in the UI.' },
        { text: 'In your brand: projects, their invoices (status, dates, totals, balance due), the files you share, plus at-a-glance counts and total outstanding. Clients can also approve or reject items you send for sign-off.' },
      ] },
      { kind: 'steps', items: [
        { title: 'Invite a client', body: 'People > Guests > invite by email, then choose their access level and which projects they can see. They receive a sign-in link.' },
        { title: 'They land on the portal', body: 'After signing in, guests are taken straight to /portal — their home — where they see their projects and invoices in your brand (it is also in the sidebar).' },
        { title: 'Control what they see', body: 'Adjust a guest\'s projects and permissions any time under People > Guests; changes apply immediately.' },
        { title: 'Share files', body: 'Open Drives, select a drive, and set its "Client portal" project — that drive\'s files then appear (read-only) in that project\'s clients\' portal. Leave it "Not shared" to keep a drive internal.' },
        { title: 'Request a sign-off', body: 'On Approvals, choose Request client sign-off, pick the project and describe what needs approval. It appears in that project portal under Approvals for the client to approve or reject with an optional note; the decision shows back on Approvals.' },
      ] },
      { kind: 'callout', icon: 'ti-lock', text: 'The client portal is plan-gated (Pro and above). Guests never count against your seat limit.' },
    ],
  },
  {
    id: 'playbook',
    title: 'Agency playbook',
    icon: 'ti-rocket',
    blocks: [
      {
        kind: 'p',
        text: 'Recommended setup sequence for a new agency deployment. Each phase builds on the last — follow the order to avoid rework.',
      },
      {
        kind: 'steps',
        items: [
          {
            title: 'Phase 0 — Foundation',
            body: 'Platform: create the tenant, assign a plan. Settings: upload logo + brand color (re-themes immediately). Roles: define role templates. Users: invite team, assign roles.',
          },
          {
            title: 'Phase 1 — Client & pipeline',
            body: 'Work → Companies: add clients and vendors. Portfolios: set up programme groupings. CRM: add companies, contacts, and open deals; move through pipeline stages.',
          },
          {
            title: 'Phase 2 — Project delivery',
            body: 'Won deal → create Project linked to Company and Portfolio. Ideas board for pre-sales concepts needing team input. Project detail: add tasks, assign contributors, log risks, enter budget lines.',
          },
          {
            title: 'Phase 3 — Staffing & onboarding',
            body: 'Employees: create profiles. Training & JDs: build the library and job descriptions first. Onboarding templates: define tasks + link training docs. Apply template to each new hire.',
          },
          {
            title: 'Phase 4 — Ongoing operations',
            body: 'Tasks & Risk: daily updates. Attendance & Leave: staff clock in/out; approve leave to maintain accurate balances. Payroll: run monthly; mark Processed then Paid → ledger posts automatically.',
          },
          {
            title: 'Phase 5 — Review & governance',
            body: 'Dashboard: weekly KPI review. Accounting: income vs. expense balance and per-project Financial Data. Audit Log: periodic compliance review. Ideas: encourage submissions → vote → convert top ideas to next-cycle projects.',
          },
        ],
      },
    ],
  },
  {
    id: 'design',
    title: 'Design decisions',
    icon: 'ti-tool',
    blocks: [
      {
        kind: 'bullets',
        items: [
          {
            text: 'RLS-first isolation',
            sub: ['Every query is scoped by org_id at the database layer. Application code cannot accidentally leak cross-org data.'],
          },
          {
            text: 'INSERT-RETURNING safety',
            sub: ['Write paths use return=minimal + a re-fetch rather than .select() after insert, avoiding an RLS re-application edge case on newly inserted rows.'],
          },
          {
            text: 'Polymorphic custom fields',
            sub: ['CRM (Deals, Contacts, Companies) and HR (Employees) share one custom fields schema. Define a field once per entity type; all records inherit it.'],
          },
          {
            text: 'Trigger-based audit',
            sub: ['Audit log entries are written by DB triggers, not application code. They cannot be bypassed by a misconfigured API call.'],
          },
          {
            text: 'White-label via CSS tokens',
            sub: ['Branding changes write --color-accent and related CSS custom properties. No per-tenant builds, no CDN invalidation.'],
          },
          {
            text: 'Idempotent payroll→ledger',
            sub: ['The ledger entry is created in the same DB transaction as the payroll status update, keyed on payroll_run_id. Re-processing is safe.'],
          },
        ],
      },
    ],
  },
  {
    id: 'reselling',
    title: 'Reselling & snapshots',
    icon: 'ti-building-community',
    blocks: [
      { kind: 'p', text: 'If your workspace is enabled as a reseller, you can create and manage your own client workspaces (sub-tenants) under your brand — each with its own login, data and team. Reselling turns your workspace into a mini-platform. Open Reseller in the sidebar (it appears only when reselling is enabled on your plan).' },
      { kind: 'steps', items: [
        { title: '1. Get reselling enabled', body: 'Reselling is part of the white-label plan. The platform team switches it on for your workspace; once on, a Reseller item appears in your sidebar.' },
        { title: '2. Build a master workspace', body: 'Set up one workspace the way you want every client to start: managed lists, custom task statuses, tags, theme/branding, custom fields, role templates and document templates. This becomes the blueprint for your snapshots.' },
        { title: '3. Save a snapshot', body: 'On the Reseller page, type a name (e.g. “Agency starter”) and click Save snapshot. It captures your workspace configuration as a reusable blueprint.' },
        { title: '4. Invite a sub-tenant', body: 'Click Invite sub-tenant, enter the client workspace name, the owner’s email and a plan, and pick a snapshot under “Start from snapshot”. Share the generated invite link. When the owner accepts, their workspace is created and the snapshot is applied automatically — they start fully configured, not empty.' },
        { title: '5. Manage and view', body: 'The Reseller page lists your sub-tenants with member and seat counts, plus a wholesale billing summary of what the platform bills you. Use “View as” to open a sub-tenant’s workspace in a private window. You bill your own clients directly.' },
      ] },
      { kind: 'table', headers: ['A snapshot clones', 'A snapshot does NOT clone'], rows: [
        ['Managed lists & options, custom task statuses, tags', 'Business data (projects, tasks, deals, invoices)'],
        ['Theme skin & branding', 'Team members or user accounts'],
        ['Custom fields, role templates, document & onboarding templates', 'Anything tied to specific people or records'],
        ['Automations (copied as inactive drafts)', 'Live automation history (fire counts, last run)'],
      ] },
      { kind: 'callout', icon: 'ti-camera', text: 'Snapshots capture configuration, not data — a new client starts with your setup but a clean slate. Keep several snapshots (e.g. one per client type) and choose the right one per invite.' },
      { kind: 'callout', icon: 'ti-bolt', text: 'Automations come across as inactive drafts: any reference to a specific person (such as an assignee) is cleared so nothing can misfire in the new workspace. Review each one and switch it on when ready.' },
      { kind: 'callout', icon: 'ti-shield-lock', text: 'A reseller can only see and manage its own sub-tenants, and sub-tenants can never be put on the white-label or reseller plan. These limits are enforced on the server.' },
    ],
  },
  {
    id: 'help',
    title: 'Getting help & the Ask assistant',
    icon: 'ti-sparkles',
    blocks: [
      { kind: 'p', text: 'Help is built into the app in three connected ways, all powered by this guide. You are never more than a click from an answer.' },
      { kind: 'bullets', items: [
        { text: 'Contextual "?" links', sub: ['Most pages show a small "?" next to the title, and tricky fields have their own. Each one jumps straight to the matching section of this guide.'] },
        { text: 'Search the guide', sub: ['Open Docs and type in the search box to filter every section by keyword. Deep-links (e.g. /docs#billing-plans) open the exact section.'] },
        { text: 'The Ask assistant', sub: ['The "Ask" button in the bottom-right corner opens a chat assistant. Ask a question in plain language and it answers from this guide, with links to the sections it used.'] },
      ] },
      { kind: 'steps', items: [
        { title: 'Ask a question', body: 'Click Ask (bottom-right), type your question, and press enter. Answers are short and to the point, with source links you can open for the full detail.' },
        { title: 'When in doubt, open the source', body: 'Every answer lists the guide sections it came from. Click one to read the complete section here in Docs.' },
      ] },
      { kind: 'callout', icon: 'ti-refresh', text: 'The assistant always answers from the current guide — when a feature changes and this guide is updated, the assistant is instantly up to date too. There is nothing to retrain.' },
      { kind: 'callout', icon: 'ti-settings', text: 'Platform operators: connect an LLM key under Console ▸ AI assistant to make answers conversational. Without a key the assistant still works and returns the most relevant guide section.' },
    ],
  },
  {
    id: 'agents',
    title: 'AI Agents & approvals',
    icon: 'ti-robot',
    blocks: [
      { kind: 'p', text: 'Agents are AI workers that operate your back office \u2014 accounting, tasks, CRM, HR, support \u2014 under human control. An agent never acts on its own: it proposes a typed action, a person approves it with one click, and every action is audited and reversible.' },
      { kind: 'bullets', items: [
        { text: 'Scoped, never a bypass', sub: ['An agent can only do what the approving person could do \u2014 every action runs through the same permissions and tenant isolation a human is subject to.'] },
        { text: 'Approve-first by default', sub: ['Agents propose; a person with the Approve agent actions permission approves or rejects. Money, payroll and legal actions always stay approve-first.'] },
        { text: 'Audited & reversible', sub: ['Every proposal, approval, execution and rollback is recorded in an append-only trail, and executed actions can be rolled back in one click.'] },
        { text: 'Cost ceilings', sub: ['Set per-day or per-month run and dollar limits (org-wide or per agent). Agent runs are refused once a ceiling is reached.'] },
      ] },
      { kind: 'steps', items: [
        { title: '1. Create an agent', body: 'Open Agents \u25b8 New agent. Give it a name, pick a domain (Accounting, Tasks, CRM, HR, Support) and an autonomy level \u2014 Approve-first is recommended.' },
        { title: '2. Grant tools', body: 'Re-open the agent and tick the tools it may use. Each tool shows its risk level and whether it is reversible.' },
        { title: '3. Set a cost ceiling', body: 'On the Agents page set an org-wide day/month limit on runs or dollars so an agent can never run away.' },
        { title: '4. Review the queue', body: 'Proposed actions appear under Agent approvals. Open one to see the exact change and audit trail, then Approve, Reject, or (after execution) Roll back.' },
        { title: '5. Track the ROI', body: 'Open Agents \u25b8 Activity & ROI to see the time and money your agents have saved \u2014 actions executed, hours saved, value created net of agent cost, and how many actions were rolled back \u2014 over the last 7, 30 or 90 days.' },
      ] },
      { kind: 'callout', icon: 'ti-wand', text: 'New here? On the Agents page click "Add starter agents" to provision a ready-made back-office team \u2014 Task Assistant, Onboarding Helper, Expense Categorizer, Support Triage and Pipeline Mover \u2014 pre-wired with the right tools. Nothing runs until you trigger it.' },
      { kind: 'callout', icon: 'ti-radar', text: 'No LLM key? Open an Accounting, Tasks or CRM agent and click "Find work in my data" \u2014 the agent scans your real records (uncategorized expenses, overdue tasks, stale deals) and proposes concrete actions you can approve, or that auto-run if the agent is in Auto low-risk mode. An LLM key adds free-form natural-language requests on top.' },
      { kind: 'callout', icon: 'ti-flask', text: 'No LLM key yet? Open an agent and click "Generate sample proposal" to see the approve \u2192 roll back flow on sample data. Connect a provider key under Console \u25b8 AI assistant to let agents propose real actions.' },
      { kind: 'callout', icon: 'ti-bolt', text: 'Graduated autonomy: set an agent to "Auto low-risk" and its low-risk, reversible actions run automatically with no approval click \u2014 money, payroll and any medium or high-risk action still wait for a person. Every auto action is audited and one-click reversible, and cost ceilings still apply. Switch the agent back to Approve-first (or disable it) to stop auto-execution.' },
      { kind: 'callout', icon: 'ti-shield-lock', text: 'Permissions: "Manage agents" lets a person create and configure agents; "Approve agent actions" lets them approve, reject and roll back. Owners and admins have both. Grant them on Roles.' },
      { kind: 'callout', icon: 'ti-chart-line', text: 'Activity & ROI: the Agents \u25b8 Activity & ROI page measures what your agents are worth \u2014 actions executed, estimated hands-on time saved, the dollar value created (at a blended hourly rate you set) net of metered agent cost, and a reliability score (how few executed actions were rolled back), broken down by domain over a 7/30/90-day window. Read-only; visible to agent managers and approvers.' },
      { kind: 'callout', icon: 'ti-slash', text: 'Chat commands: type #task, #onboard or #expense (or your own) in any chat channel and an agent acts on it. Manage them on the Agents page (Chat commands) — add a custom #keyword mapped to an action, set who can use it (any member vs agent-managers), enable/disable. Commands are approval-gated by default — they propose an action that appears in Agent Approvals. Admins can also add custom natural-language commands (which run the AI proposer) and can mark a low-risk, reversible command as auto-run, which skips the approval click while staying audited and one-click reversible — money and higher-risk actions can never be auto-run. Members can use member-commands (always queued for approval); only managers configure them.' },
    ],
  },
  {
    id: 'agent-billing',
    title: 'Agent billing & reseller margin',
    icon: 'ti-coin',
    blocks: [
      { kind: 'p', text: 'AI agent usage is metered automatically — every agent run and the tokens it consumes are counted per workspace, per day and per month. Metered billing turns that usage into revenue: the platform sets a wholesale rate, and resellers mark it up for their own sub-tenants and keep the margin.' },
      { kind: 'bullets', items: [
        { text: 'Two metered units', sub: ['Price per agent run and price per 1,000 tokens. Set either or both; leave a unit at 0 to not charge for it.'] },
        { text: 'Wholesale vs. retail', sub: ['The platform bills every workspace (and every reseller) at the wholesale rate. A reseller sets its own retail rate for its sub-tenants. Margin = retail minus wholesale.'] },
        { text: 'Metered automatically', sub: ['Usage accrues as agents run — nothing to track by hand. Cost ceilings still cap spend independently of billing.'] },
      ] },
      { kind: 'steps', items: [
        { title: 'Platform: set wholesale rates', body: 'Console ▸ Billing ▸ AI agent billing. Enable metered billing and set the wholesale price per run and per 1,000 tokens. The Agent revenue panel shows this month’s wholesale total across all tenants.' },
        { title: 'Reseller: set your retail rates', body: 'Reseller ▸ Plans & features ▸ AI agent pricing. Set what you charge your clients per run and per 1,000 tokens; your wholesale cost is shown for reference.' },
        { title: 'Reseller: watch your margin', body: 'The AI agent margin card sums your sub-tenants’ usage this month: retail (what you bill them) minus wholesale (what the platform bills you) is your margin, with a per-client breakdown.' },
        { title: 'Tenant: see your cost', body: 'The Agents page shows an estimated agent cost for the current month at whatever rate applies to you — your reseller’s rate if you are a sub-tenant, otherwise the platform rate.' },
      ] },
      { kind: 'callout', icon: 'ti-shield-lock', text: 'Only platform admins set wholesale rates; only a reseller’s owner or admin sets that reseller’s retail rates. A sub-tenant sees its own cost but never another tenant’s usage or a reseller’s internal margin.' },
      { kind: 'callout', icon: 'ti-coin', text: 'Cost ceilings (on the Agents page) and metered billing are independent: ceilings stop runaway spend; billing prices the usage that does happen.' },
    ],
  },
];
// ---------------------------------------------------------------------------
// Search + retrieval helpers (lexical — read the live text on every call, so
// new/edited sections are reflected immediately with zero recompute).
// ---------------------------------------------------------------------------

// Flatten a section's text (lowercased) for client-side search filtering + scoring.
export function sectionText(section: Section): string {
  return sectionParts(section).join(' ').toLowerCase();
}

// Readable, original-case plaintext of a section — used as LLM grounding context.
export function sectionPlain(section: Section): string {
  const lines: string[] = [section.title];
  for (const b of section.blocks) {
    if (b.kind === 'p' || b.kind === 'callout') lines.push(b.text);
    else if (b.kind === 'bullets') b.items.forEach((it) => { lines.push('- ' + it.text); if (it.sub) it.sub.forEach((s) => lines.push('  · ' + s)); });
    else if (b.kind === 'steps') b.items.forEach((it) => lines.push('- ' + it.title + ': ' + it.body));
    else if (b.kind === 'table') { lines.push(b.headers.join(' | ')); b.rows.forEach((r) => lines.push(r.join(' | '))); }
  }
  return lines.join('\n');
}

function sectionParts(section: Section): string[] {
  const parts: string[] = [section.title];
  for (const b of section.blocks) {
    if (b.kind === 'p' || b.kind === 'callout') parts.push(b.text);
    else if (b.kind === 'bullets') b.items.forEach((it) => { parts.push(it.text); if (it.sub) parts.push(...it.sub); });
    else if (b.kind === 'steps') b.items.forEach((it) => parts.push(it.title, it.body));
    else if (b.kind === 'table') { parts.push(...b.headers); b.rows.forEach((r) => parts.push(...r)); }
  }
  return parts;
}

const STOPWORDS = new Set(['the','a','an','to','of','in','on','for','and','or','is','are','do','does','how','what','where','can','i','my','me','it','this','that','with','you','your','they','their','as','at','be','by','from','about','into','set','use','get','add','see','open']);

function tokenize(q: string): string[] {
  return Array.from(new Set(
    (q.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  ));
}

export type RetrievedSection = { section: Section; score: number };

// Rank SECTIONS against a query by term frequency (+ title/synonym boosts).
// Returns the top `limit` scoring sections — the live grounding for an answer.
export function retrieveSections(query: string, limit = 3): RetrievedSection[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const scored = SECTIONS.map((section) => {
    const title = section.title.toLowerCase();
    const text = sectionText(section);
    let score = 0;
    for (const t of terms) {
      const occ = text.split(t).length - 1;
      if (occ > 0) score += 1 + Math.min(occ, 4) * 0.5; // diminishing TF
      if (title.includes(t)) score += 4;                 // title match boost
      if (section.id.includes(t)) score += 2;            // anchor-id boost
    }
    return { section, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
