import { useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';

// ---------------------------------------------------------------------------
// Content model — structured data avoids any runtime markdown parsing
// ---------------------------------------------------------------------------

type BulletItem = { text: string; sub?: string[] };
type TableRow = string[];

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: BulletItem[] }
  | { kind: 'table'; headers: string[]; rows: TableRow[] }
  | { kind: 'steps'; items: { title: string; body: string }[] }
  | { kind: 'callout'; icon: string; text: string };

type Section = {
  id: string;
  title: string;
  icon: string;
  blocks: Block[];
};

const SECTIONS: Section[] = [
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
          ['Chat', 'Org-wide General channel + auto-created per-project channel. @mention people, #link tasks/projects, /remind. 12 s polling, no external dependency.'],
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
];

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderBlock(block: Block, idx: number) {
  if (block.kind === 'p') {
    return (
      <p key={idx} className="text-sm text-content leading-relaxed">
        {block.text}
      </p>
    );
  }
  if (block.kind === 'callout') {
    return (
      <div key={idx} className="flex items-start gap-3 rounded-lg bg-accent/10 border border-accent/20 px-4 py-3">
        <span className="w-7 h-7 rounded-md grid place-items-center bg-accent/15 text-accentstrong shrink-0 mt-0.5">
          <Icon name={block.icon} className="text-sm" />
        </span>
        <p className="text-sm text-content leading-relaxed">{block.text}</p>
      </div>
    );
  }
  if (block.kind === 'bullets') {
    return (
      <ul key={idx} className="space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="text-sm text-content leading-relaxed">
            <span className="inline-flex items-start gap-2">
              <span className="text-accentstrong mt-1 shrink-0">
                <Icon name="ti-circle-filled" className="text-[6px]" />
              </span>
              <span>
                {item.text}
                {item.sub && item.sub.map((s, si) => (
                  <span key={si} className="block text-muted mt-0.5">{s}</span>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === 'table') {
    return (
      <div key={idx} className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface2 text-left">
              {block.headers.map((h, hi) => (
                <th key={hi} className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide border-b border-line">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-line last:border-0 hover:bg-surface2/50 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-3 py-2 text-sm ${ci === 0 ? 'font-medium text-content whitespace-nowrap' : 'text-muted'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.kind === 'steps') {
    return (
      <ol key={idx} className="space-y-3">
        {block.items.map((step, si) => (
          <li key={si} className="flex gap-3">
            <span className="w-6 h-6 rounded-full grid place-items-center bg-accent/10 text-accentstrong text-xs font-bold shrink-0 mt-0.5">
              {si + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-content">{step.title}</p>
              <p className="text-sm text-muted mt-0.5 leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [active, setActive] = useState(SECTIONS[0].id);

  return (
    <Layout flat title="Docs">
      <PageHeader
        title="System Guide"
        subtitle="Module reference, cross-module connections, and the recommended agency operating workflow."
      />

      <div className="flex gap-6 items-start" style={{ height: 'calc(100vh - 9.5rem)' }}>
        {/* Left nav — sticky, hidden below lg */}
        <aside className="hidden lg:flex flex-col gap-0.5 w-52 shrink-0 h-full overflow-y-auto pr-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActive(s.id);
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors
                ${active === s.id
                  ? 'bg-accent/10 text-accentstrong font-medium'
                  : 'text-muted hover:text-content hover:bg-surface2'}`}
            >
              <Icon name={s.icon} className="text-base shrink-0" />
              {s.title}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6 h-full overflow-y-auto pr-1 pb-4">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="card p-5 scroll-mt-2"
            >
              {/* Section header */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-line">
                <span className="w-8 h-8 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0">
                  <Icon name={section.icon} className="text-base" />
                </span>
                <h2 className="text-base font-semibold text-content">{section.title}</h2>
              </div>
              <div className="space-y-4">
                {section.blocks.map((block, bi) => renderBlock(block, bi))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Layout>
  );
}
