// #8 Industry-specific demo-data generator. Builds the payload consumed by the
// tenant_seed_demo RPC. Vocabulary is keyed off the #9 taxonomy industries. Generates
// 15-20 records per module so every page looks populated for demos/pitching. Projects
// are linked to companies + portfolios; deals/invoices/ledger/ideas link to records too.
import { TAXONOMY, INDUSTRIES } from './taxonomy';

export interface DemoTask { name: string; status?: string; priority?: string; estimated_hours?: number }
export interface DemoProject { name: string; description?: string; status?: string; priority?: string; progress?: number; company_index?: number; portfolio_index?: number; tasks: DemoTask[] }
export interface DemoPortfolio { name: string; description?: string; company_index: number }
export interface DemoDeal { title: string; value: number; stage: string; company_index?: number }
export interface DemoLedger { type: 'income' | 'expense'; category: string; amount: number; notes?: string; project_index?: number }
export interface DemoProduct { name: string; type?: string; unit_price?: number }
export interface DemoInvoiceLine { description: string; qty: number; unit_price: number }
export interface DemoInvoice { number: string; status?: string; client?: string; project_index?: number; lines: DemoInvoiceLine[] }
export interface DemoSupport { subject: string; category?: string; priority?: string; status?: string }
export interface DemoRisk { title: string; category?: string; impact?: number; probability?: number; status?: string }
export interface DemoIdea { title: string; pitch?: string; status?: string; project_index?: number }
export interface DemoAutomation { name: string; trigger_type: string; match: Record<string, unknown>; actions: unknown[] }
export interface DemoTemplate { name: string; doc_type: string; body: string }
export interface DemoLead { name: string; contact_name?: string; status?: string; value?: number; currency?: string; source?: string }
export interface DemoProposal { title: string; client_name?: string; amount?: number; currency?: string; status?: string }
export interface DemoContract { title: string; client_name?: string; value?: number; currency?: string; status?: string }
export interface DemoJob { title: string; department?: string; location?: string; employment_type?: string; openings?: number; status?: string }
export interface DemoApplication { candidate_name: string; email?: string; source?: string; stage?: string; rating?: number }
export interface DemoInterview { mode?: string; status?: string; stage_label?: string }
export interface DemoOffer { candidate_name: string; job_title?: string; salary?: number; currency?: string; status?: string }
export interface DemoSubscription { service: string; category?: string; plan_name?: string; cost?: number; status?: string }
export interface DemoDomain { domain: string; registrar?: string; cost?: number; status?: string }
export interface DemoAsset { name: string; asset_type?: string; value?: number; status?: string }
export interface DemoBankAccount { label: string; bank_name?: string; account_type?: string; balance?: number }
export interface DemoLiability { name: string; type?: string; principal?: number; balance?: number; status?: string }
export interface DemoRecurring { name: string; category?: string; amount?: number; cycle?: string; status?: string }
export interface DemoBill { bill_number?: string; vendor_name?: string; amount?: number; status?: string }
export interface DemoExpenseClaim { title: string; amount?: number; status?: string }
export interface DemoCreditNote { credit_number: string; client_name?: string; amount?: number; status?: string }
export interface DemoForm { name: string; slug: string; status?: string; fields?: unknown[] }
export interface DemoDrive { name: string; description?: string }
export interface DemoPayload {
  clients: string[]; projects: DemoProject[]; deals: DemoDeal[]; ledger: DemoLedger[];
  companies: string[]; portfolios: DemoPortfolio[]; teams: string[]; ideas: DemoIdea[];
  products: DemoProduct[]; invoices: DemoInvoice[]; support: DemoSupport[]; risks: DemoRisk[];
  automations: DemoAutomation[]; templates: DemoTemplate[];
  leads: DemoLead[]; proposals: DemoProposal[]; contracts: DemoContract[];
  jobs: DemoJob[]; applications: DemoApplication[]; interviews: DemoInterview[]; offers: DemoOffer[];
  subscriptions: DemoSubscription[]; domains: DemoDomain[]; assets: DemoAsset[]; bank_accounts: DemoBankAccount[]; liabilities: DemoLiability[]; recurring: DemoRecurring[];
  bills: DemoBill[]; expense_claims: DemoExpenseClaim[]; credit_notes: DemoCreditNote[]; forms: DemoForm[]; drives: DemoDrive[];
}

const T = (name: string, status: string, priority = 'Medium', h = 6): DemoTask => ({ name, status, priority, estimated_hours: h });
const STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Won', 'Lead'];
const PROJ_STATUS = ['Active', 'Planning', 'On Hold', 'Completed'];
const PRIOS = ['High', 'Medium', 'Low'];
const TASK_STATUS = ['Backlog', 'In Progress', 'In Review', 'Done'];

type Pack = { clients: string[]; projects: { name: string; tasks: [string, string, string] }[]; deals: string[]; ledgerCats: [string, string]; };

const PACKS: Record<string, Pack> = {
  'Technology & Software': {
    clients: ['Northwind Labs', 'Helio Systems', 'Quantic Retail'],
    projects: [
      { name: 'v2 API platform launch', tasks: ['Finalize API spec', 'Build auth & rate limiting', 'Beta onboarding flow'] },
      { name: 'Customer onboarding revamp', tasks: ['Map activation funnel', 'Ship in-app checklist', 'Instrument analytics'] },
      { name: 'SOC 2 readiness', tasks: ['Gap assessment', 'Implement logging controls', 'Vendor security review'] },
    ],
    deals: ['Helio Systems — Enterprise seat expansion', 'Quantic Retail — Annual SaaS contract', 'Northwind — API platform add-on'],
    ledgerCats: ['Subscription revenue', 'Cloud hosting'],
  },
  'Professional Services': {
    clients: ['Meridian Holdings', 'Cedar & Co', 'Atlas Brands'],
    projects: [
      { name: 'Q3 brand campaign — Atlas', tasks: ['Creative concepting', 'Media plan & buy', 'Launch & reporting'] },
      { name: 'Operations diagnostic — Meridian', tasks: ['Stakeholder interviews', 'Process mapping', 'Recommendations deck'] },
      { name: 'Website rebuild — Cedar', tasks: ['Content audit', 'Design system', 'Build & QA'] },
    ],
    deals: ['Atlas Brands — Retainer renewal', 'Meridian — Strategy engagement', 'Cedar & Co — Rebrand project'],
    ledgerCats: ['Client retainer', 'Subcontractor fees'],
  },
  'Construction & Real Estate': {
    clients: ['Harbor Point Developers', 'Summit Builders', 'Greenfield Estates'],
    projects: [
      { name: 'Harbor Point — Tower A', tasks: ['Permit approval', 'Foundation pour', 'Structural inspection'] },
      { name: 'Summit retail fit-out', tasks: ['Site survey', 'MEP rough-in', 'Final handover'] },
      { name: 'Greenfield Phase 2', tasks: ['Earthworks', 'Utility connections', 'Landscaping'] },
    ],
    deals: ['Harbor Point — Tower B bid', 'Summit — Warehouse contract', 'Greenfield — Phase 3 award'],
    ledgerCats: ['Progress billing', 'Materials & subcontractors'],
  },
  'Healthcare & Life Sciences': {
    clients: ['Lakeside Clinic', 'Vita Diagnostics', 'CarePlus Group'],
    projects: [
      { name: 'EHR migration — CarePlus', tasks: ['Data mapping', 'Clinician training', 'Go-live cutover'] },
      { name: 'New clinic onboarding', tasks: ['Credentialing', 'Equipment setup', 'Patient intake flow'] },
      { name: 'Lab accreditation', tasks: ['QC protocol review', 'Audit prep', 'Corrective actions'] },
    ],
    deals: ['CarePlus — Telehealth rollout', 'Vita — Lab services contract', 'Lakeside — Equipment lease'],
    ledgerCats: ['Patient services revenue', 'Medical supplies'],
  },
  'Education': {
    clients: ['Brightpath Academy', 'Summit College', 'LearnLoop EdTech'],
    projects: [
      { name: 'LMS rollout — Brightpath', tasks: ['Course migration', 'Instructor training', 'Student pilot'] },
      { name: 'Enrollment campaign', tasks: ['Lead funnel setup', 'Open day events', 'Application follow-up'] },
      { name: 'Certification program launch', tasks: ['Curriculum design', 'Assessment build', 'Accreditation filing'] },
    ],
    deals: ['Summit College — Campus license', 'LearnLoop — Content partnership', 'Brightpath — Annual renewal'],
    ledgerCats: ['Tuition & fees', 'Faculty payroll'],
  },
  'Retail & E-commerce': {
    clients: ['Urban Threads', 'PantryBox', 'Nova Home'],
    projects: [
      { name: 'Holiday store launch', tasks: ['Merchandising plan', 'Site & checkout setup', 'Campaign go-live'] },
      { name: 'Fulfillment optimization', tasks: ['Warehouse layout', 'Carrier integration', 'Returns workflow'] },
      { name: 'Loyalty program', tasks: ['Rewards design', 'POS integration', 'Launch comms'] },
    ],
    deals: ['Nova Home — Wholesale account', 'PantryBox — Subscription tier', 'Urban Threads — Marketplace deal'],
    ledgerCats: ['Product sales', 'Cost of goods'],
  },
  'Manufacturing & Industrial': {
    clients: ['Forge Components', 'Apex Motors', 'Verde Energy'],
    projects: [
      { name: 'Production line upgrade', tasks: ['Equipment procurement', 'Line installation', 'Throughput validation'] },
      { name: 'ISO 9001 recertification', tasks: ['Process audit', 'Documentation update', 'Management review'] },
      { name: 'New SKU introduction', tasks: ['Tooling design', 'Pilot run', 'Quality sign-off'] },
    ],
    deals: ['Apex Motors — Parts supply contract', 'Verde — Equipment order', 'Forge — OEM agreement'],
    ledgerCats: ['Unit sales', 'Raw materials'],
  },
  'Hospitality & Services': {
    clients: ['Bayview Resort', 'The Copper Spoon', 'Evergreen Events'],
    projects: [
      { name: 'Restaurant launch — Copper Spoon', tasks: ['Menu engineering', 'Staff hiring & training', 'Soft opening'] },
      { name: 'Resort season prep', tasks: ['Booking system setup', 'Vendor contracts', 'Guest experience audit'] },
      { name: 'Wedding season rollout', tasks: ['Package design', 'Venue partnerships', 'Marketing launch'] },
    ],
    deals: ['Bayview — Corporate retreat package', 'Evergreen — Annual events contract', 'Copper Spoon — Catering account'],
    ledgerCats: ['Bookings & covers', 'Food & beverage costs'],
  },
  'Financial Services': {
    clients: ['Sterling Capital', 'Beacon Insurance', 'PayFlow Fintech'],
    projects: [
      { name: 'KYC/AML compliance upgrade', tasks: ['Policy review', 'Vendor onboarding', 'Staff certification'] },
      { name: 'Wealth client portal', tasks: ['Requirements', 'Build & integrate', 'Security review'] },
      { name: 'Payments launch — PayFlow', tasks: ['Gateway integration', 'Risk rules', 'Pilot release'] },
    ],
    deals: ['Sterling — Advisory mandate', 'Beacon — Brokerage partnership', 'PayFlow — Processing contract'],
    ledgerCats: ['Fees & commissions', 'Compliance costs'],
  },
  'Media & Creative': {
    clients: ['Lumen Studios', 'Pixel Forge', 'Echo Media'],
    projects: [
      { name: 'Documentary production', tasks: ['Pre-production', 'Principal shoot', 'Edit & color'] },
      { name: 'Brand content series', tasks: ['Concept & script', 'Production', 'Distribution plan'] },
      { name: 'Game vertical slice', tasks: ['Prototype', 'Art pass', 'Playtest'] },
    ],
    deals: ['Echo Media — Content retainer', 'Lumen — Production contract', 'Pixel Forge — Publishing deal'],
    ledgerCats: ['Production revenue', 'Talent & crew'],
  },
  'Logistics & Transportation': {
    clients: ['Cargo Lane', 'SwiftFleet', 'Port Nexus'],
    projects: [
      { name: 'Warehouse network expansion', tasks: ['Site selection', 'WMS deployment', 'Staffing & launch'] },
      { name: 'Last-mile optimization', tasks: ['Route modeling', 'Driver app rollout', 'KPI dashboard'] },
      { name: 'Fleet electrification pilot', tasks: ['Vehicle procurement', 'Charging setup', 'Pilot review'] },
    ],
    deals: ['Port Nexus — 3PL contract', 'SwiftFleet — Courier agreement', 'Cargo Lane — Freight account'],
    ledgerCats: ['Freight revenue', 'Fuel & fleet'],
  },
  'Nonprofit & Public': {
    clients: ['Hope Foundation', 'City Works Dept', 'Unity Association'],
    projects: [
      { name: 'Annual fundraising gala', tasks: ['Sponsor outreach', 'Event logistics', 'Donor reporting'] },
      { name: 'Community grant program', tasks: ['Application portal', 'Review committee', 'Disbursement'] },
      { name: 'Membership drive', tasks: ['Campaign design', 'Outreach', 'Onboarding'] },
    ],
    deals: ['Hope Foundation — Major gift', 'Unity — Corporate sponsorship', 'City Works — Service grant'],
    ledgerCats: ['Donations & grants', 'Program expenses'],
  },
  'Telecom': {
    clients: ['FiberOne', 'MetroLink ISP', 'WaveCom'],
    projects: [
      { name: 'Fiber rollout — district 4', tasks: ['Network design', 'Trenching & cabling', 'Service activation'] },
      { name: 'Network capacity upgrade', tasks: ['Core equipment', 'Migration', 'Performance test'] },
      { name: 'ISP customer portal', tasks: ['Billing integration', 'Self-service flows', 'Launch'] },
    ],
    deals: ['MetroLink — Backbone contract', 'WaveCom — Enterprise connectivity', 'FiberOne — Residential rollout'],
    ledgerCats: ['Subscription revenue', 'Network opex'],
  },
};

function genericPack(industry: string): Pack {
  const ind = TAXONOMY.find((i) => i.name === industry);
  const cats = ind ? ind.categories.map((c) => c.name) : ['Operations', 'Growth', 'Delivery'];
  const c = (i: number) => cats[i % cats.length];
  return {
    clients: ['Acme Group', 'Beacon Partners', 'Cardinal Co'],
    projects: [
      { name: `${c(0)} initiative`, tasks: ['Discovery & scope', 'Execution', 'Review & handover'] },
      { name: `${c(1)} rollout`, tasks: ['Planning', 'Implementation', 'QA & launch'] },
      { name: `Q3 ${c(2)} program`, tasks: ['Kickoff', 'Build', 'Reporting'] },
    ],
    deals: [`${c(0)} engagement`, `${c(1)} contract`, `${c(2)} expansion`],
    ledgerCats: ['Services revenue', 'Operating costs'],
  };
}

// ---- generic pools used to reach 15-20 records/module ----
const COMPANY_BASES = ['Northgate', 'Brightline', 'Vertex', 'Harborview', 'Cedarcrest', 'Atlas', 'Meridian', 'Quanta', 'Lumen', 'Apex', 'Beacon', 'Cobalt', 'Evergreen', 'Forge', 'Summit', 'Orion'];
const COMPANY_SUFFIX = ['Group', 'Holdings', 'Partners', 'Industries', 'Labs', 'Solutions', 'Systems', 'Co'];
const PORTFOLIO_DEFS: [string, string][] = [
  ['Core Delivery', 'Flagship client and delivery work'],
  ['Growth Initiatives', 'Revenue and expansion projects'],
  ['Strategic Programs', 'Cross-functional strategic bets'],
  ['Client Services', 'Account and retainer engagements'],
  ['Internal Operations', 'Internal tooling and process work'],
];
const TASK_EXTRAS = ['Kickoff & planning', 'Stakeholder review', 'QA & sign-off', 'Status reporting', 'Risk assessment', 'Documentation'];
const PROJ_QUAL = ['Phase 1', 'Phase 2', 'North region', 'EMEA', 'Q3', 'Q4', 'Pilot', 'Rollout'];
const DEAL_QUAL = ['Renewal', 'Expansion', 'Upsell', 'New logo', 'Add-on'];
const IDEA_POOL = ['Customer feedback portal', 'Internal process automation', 'Mobile companion app', 'Referral rewards program', 'AI-assisted reporting', 'Self-serve onboarding', 'Partner marketplace', 'Knowledge base revamp', 'Usage-based pricing tier', 'In-app live chat', 'Quarterly NPS survey', 'Template gallery', 'Dark-mode theme', 'Bulk import tool', 'Audit-log export'];
const IDEA_STATUS = ['idea', 'exploring', 'approved', 'building', 'shipped'];
const PRODUCT_POOL: [string, string, number][] = [
  ['Consulting — Standard', 'service', 150], ['Consulting — Senior', 'service', 250],
  ['Implementation package', 'service', 2500], ['Onboarding & setup', 'service', 1000],
  ['Premium support (monthly)', 'service', 500], ['Training workshop', 'service', 1200],
  ['Annual license — Starter', 'product', 1200], ['Annual license — Pro', 'product', 3600],
  ['Add-on module', 'product', 600], ['Data migration', 'service', 1800],
  ['Custom integration', 'service', 3200], ['Managed service (monthly)', 'service', 900],
];
const SUPPORT_POOL: [string, string, string, string][] = [
  ['Cannot access the dashboard', 'Account', 'high', 'open'],
  ['Question about my latest invoice', 'Billing', 'medium', 'resolved'],
  ['Feature request: export to CSV', 'Feature', 'low', 'open'],
  ['Password reset not working', 'Account', 'high', 'in_progress'],
  ['How do I invite a teammate?', 'How-to', 'low', 'resolved'],
  ['Report shows wrong totals', 'Bug', 'high', 'open'],
  ['Upgrade my plan', 'Billing', 'medium', 'open'],
  ['Mobile app keeps logging out', 'Bug', 'high', 'in_progress'],
  ['Need an extra admin seat', 'Account', 'medium', 'resolved'],
  ['Integration with Slack?', 'Feature', 'low', 'open'],
  ['Data not syncing', 'Bug', 'high', 'open'],
  ['Cancel my subscription', 'Billing', 'medium', 'resolved'],
  ['Custom domain setup help', 'How-to', 'medium', 'open'],
  ['Two-factor authentication issue', 'Account', 'high', 'in_progress'],
];
const RISK_POOL: [string, string, number, number, string][] = [
  ['Client concentration risk', 'Strategic', 4, 3, 'Open'],
  ['Supplier / delivery delay', 'Operational', 3, 2, 'Open'],
  ['Key-person dependency', 'Operational', 4, 2, 'Open'],
  ['Scope creep on major project', 'Delivery', 3, 3, 'Open'],
  ['Cash-flow gap in Q3', 'Financial', 4, 2, 'Mitigating'],
  ['Data security / breach', 'Compliance', 5, 2, 'Open'],
  ['Regulatory change', 'Compliance', 3, 2, 'Open'],
  ['Currency / FX exposure', 'Financial', 2, 3, 'Open'],
  ['Talent attrition', 'Operational', 3, 3, 'Mitigating'],
  ['Vendor lock-in', 'Strategic', 2, 2, 'Open'],
  ['Reputational risk', 'Strategic', 4, 1, 'Open'],
  ['Technical debt accumulation', 'Delivery', 3, 4, 'Open'],
];
const EXP_CATS = ['Software & tools', 'Payroll', 'Marketing', 'Office & admin', 'Travel', 'Contractors', 'Hosting & infra', 'Professional fees'];

function genCompanies(seed: string[], n: number): string[] {
  const out: string[] = [...seed];
  let i = 0;
  while (out.length < n) {
    const base = COMPANY_BASES[i % COMPANY_BASES.length];
    const suf = COMPANY_SUFFIX[Math.floor(i / COMPANY_BASES.length) % COMPANY_SUFFIX.length];
    const name = `${base} ${suf}`;
    if (!out.includes(name)) out.push(name);
    i++;
  }
  return out.slice(0, n);
}

export function buildDemoPayload(industry: string | null | undefined): DemoPayload {
  const ind = industry && INDUSTRIES.includes(industry) ? industry : '';
  const pack = (ind && PACKS[ind]) || genericPack(ind || 'Professional Services');
  const N_COMPANIES = 12, N_PORTFOLIOS = 5, N_PROJECTS = 16, N_CLIENTS = 14, N_DEALS = 16,
    N_IDEAS = 15, N_INVOICES = 12, N_LEDGER = 24;

  const companies = genCompanies(pack.clients, N_COMPANIES);
  const portfolios: DemoPortfolio[] = PORTFOLIO_DEFS.slice(0, N_PORTFOLIOS).map(([name, description], i) => ({
    name, description, company_index: i % N_COMPANIES,
  }));

  const projects: DemoProject[] = [];
  for (let i = 0; i < N_PROJECTS; i++) {
    const base = pack.projects[i % pack.projects.length];
    const round = Math.floor(i / pack.projects.length);
    const name = round === 0 ? base.name : `${base.name} — ${PROJ_QUAL[(round - 1) % PROJ_QUAL.length]}`;
    projects.push({
      name,
      description: `${ind || 'Sample'} demo project — ${name}.`,
      status: PROJ_STATUS[i % PROJ_STATUS.length],
      priority: PRIOS[i % PRIOS.length],
      progress: [70, 20, 45, 100, 10, 85][i % 6],
      company_index: i % N_COMPANIES,
      portfolio_index: i % N_PORTFOLIOS,
      tasks: [
        T(base.tasks[0], 'Done', 'Medium', 8),
        T(base.tasks[1], 'In Progress', 'High', 12),
        T(base.tasks[2], 'Backlog', 'Medium', 6),
        T(TASK_EXTRAS[i % TASK_EXTRAS.length], TASK_STATUS[i % TASK_STATUS.length], 'Low', 4),
      ],
    });
  }

  const clients = genCompanies(pack.clients, N_CLIENTS);

  const deals: DemoDeal[] = [];
  for (let i = 0; i < N_DEALS; i++) {
    const base = pack.deals[i % pack.deals.length];
    const round = Math.floor(i / pack.deals.length);
    const title = round === 0 ? base : `${base} (${DEAL_QUAL[(round - 1) % DEAL_QUAL.length]})`;
    deals.push({ title, value: [18000, 42000, 9500, 75000, 15000, 30000][i % 6], stage: STAGES[i % STAGES.length], company_index: i % N_COMPANIES });
  }

  const ideas: DemoIdea[] = IDEA_POOL.slice(0, N_IDEAS).map((title, i) => ({
    title, pitch: `Proposal: ${title.toLowerCase()} to lift adoption and efficiency.`,
    status: IDEA_STATUS[i % IDEA_STATUS.length], project_index: i % N_PROJECTS,
  }));

  const teams = ['Delivery', 'Sales', 'Operations', 'Engineering', 'Marketing', 'Finance'];

  const products: DemoProduct[] = PRODUCT_POOL.map(([name, type, unit_price]) => ({ name, type, unit_price }));

  const tok = Math.random().toString(36).slice(2, 6).toUpperCase();
  const INV_STATUS = ['paid', 'sent', 'overdue', 'draft'];
  const invoices: DemoInvoice[] = [];
  for (let i = 0; i < N_INVOICES; i++) {
    const p1 = PRODUCT_POOL[i % PRODUCT_POOL.length];
    const p2 = PRODUCT_POOL[(i + 3) % PRODUCT_POOL.length];
    const lines: DemoInvoiceLine[] = [{ description: p1[0], qty: (i % 3) + 1, unit_price: p1[2] }];
    if (i % 2 === 0) lines.push({ description: p2[0], qty: 1, unit_price: p2[2] });
    invoices.push({ number: `INV-${tok}-${i + 1}`, status: INV_STATUS[i % INV_STATUS.length], client: companies[i % N_COMPANIES], project_index: i % N_PROJECTS, lines });
  }

  const support = SUPPORT_POOL.map(([subject, category, priority, status]) => ({ subject, category, priority, status }));
  const risks = RISK_POOL.map(([title, category, impact, probability, status]) => ({ title, category, impact, probability, status }));

  const ledger: DemoLedger[] = [];
  for (let i = 0; i < N_LEDGER; i++) {
    const isIncome = i % 3 === 0;
    ledger.push(isIncome
      ? { type: 'income', category: pack.ledgerCats[0], amount: [24000, 11500, 38000, 9000][i % 4], notes: 'Demo income', project_index: i % N_PROJECTS }
      : { type: 'expense', category: i % 2 ? pack.ledgerCats[1] : EXP_CATS[i % EXP_CATS.length], amount: [7800, 1200, 4300, 2600][i % 4], notes: 'Demo expense', project_index: i % N_PROJECTS });
  }

  const automations: DemoAutomation[] = [
    { name: 'Notify on new task', trigger_type: 'task.created', match: {}, actions: [{ type: 'notify', title: 'New task created', body: 'A new task was added to a project.', urgent: false }] },
    { name: 'Alert on won deals', trigger_type: 'deal.won', match: {}, actions: [{ type: 'notify', title: 'Deal won 🎉', body: 'A deal just moved to Won.', urgent: true }] },
    { name: 'Invoice paid alert', trigger_type: 'invoice.paid', match: {}, actions: [{ type: 'notify', title: 'Invoice paid', body: 'An invoice was marked paid.', urgent: false }] },
    { name: 'Deal stage changed', trigger_type: 'deal.stage_changed', match: {}, actions: [{ type: 'notify', title: 'Deal stage updated', body: 'A deal moved to a new stage.', urgent: false }] },
  ];

  const templates: DemoTemplate[] = [
    { name: 'Standard Proposal', doc_type: 'proposal', body: 'Dear {{client}},\n\nThank you for the opportunity. This proposal outlines our recommended scope, timeline, and investment.\n\n## Scope\n- ...\n\n## Timeline\n- ...\n\n## Investment\nTotal: {{amount}}\n\nRegards,\n{{sender}}' },
    { name: 'Service Agreement', doc_type: 'agreement', body: 'This Service Agreement is entered into between {{company}} and {{client}} effective {{date}}.\n\n1. Services\n2. Fees & Payment\n3. Term & Termination\n4. Confidentiality' },
    { name: 'Master Contract', doc_type: 'contract', body: 'MASTER SERVICES CONTRACT\n\nParties: {{company}} ("Provider") and {{client}} ("Client").\n\nThe Provider agrees to deliver the services described in each Statement of Work...' },
    { name: 'Offer Letter', doc_type: 'offer', body: 'Dear {{candidate}},\n\nWe are pleased to offer you the position of {{role}} at {{company}}, starting {{date}}.\n\nCompensation: {{salary}}\n\nWe look forward to welcoming you.' },
    { name: 'Client Welcome Email', doc_type: 'email', body: 'Hi {{client}},\n\nWelcome aboard! Your workspace is ready. Here is how to get started:\n1. Log in\n2. Invite your team\n3. Explore your dashboard\n\nWe are here to help.' },
  ];

  // CRM extra (leads / proposals / contracts) — seeded via tenant_seed_demo_crm.
  const PEOPLE = ['Alex Morgan', 'Jamie Lee', 'Priya Singh', 'Diego Ramirez', 'Sara Khan', 'Tom Becker', 'Mei Chen', 'Omar Farah'];
  const LEAD_SOURCE = ['Referral', 'Website', 'LinkedIn', 'Event', 'Cold outreach', 'Partner'];
  const LEAD_STATUS = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
  const PROPOSAL_STATUS = ['draft', 'sent', 'accepted', 'rejected'];
  const CONTRACT_STATUS = ['active', 'draft', 'expired', 'renewed'];
  const N_LEADS = 14, N_PROPOSALS = 12, N_CONTRACTS = 10;
  const leads: DemoLead[] = [];
  for (let i = 0; i < N_LEADS; i++) leads.push({ name: companies[i % companies.length], contact_name: PEOPLE[i % PEOPLE.length], status: LEAD_STATUS[i % LEAD_STATUS.length], value: [5000, 12000, 8000, 25000, 3000, 16000][i % 6], currency: 'USD', source: LEAD_SOURCE[i % LEAD_SOURCE.length] });
  const proposals: DemoProposal[] = [];
  for (let i = 0; i < N_PROPOSALS; i++) proposals.push({ title: `${pack.deals[i % pack.deals.length]} — Proposal`, client_name: clients[i % clients.length], amount: [12000, 28000, 7500, 45000, 9000][i % 5], currency: 'USD', status: PROPOSAL_STATUS[i % PROPOSAL_STATUS.length] });
  const contracts: DemoContract[] = [];
  for (let i = 0; i < N_CONTRACTS; i++) contracts.push({ title: `${pack.deals[i % pack.deals.length]} — Contract`, client_name: clients[i % clients.length], value: [24000, 60000, 15000, 90000, 18000][i % 5], currency: 'USD', status: CONTRACT_STATUS[i % CONTRACT_STATUS.length] });

  // HR (jobs -> applications -> interviews/offers) — seeded via tenant_seed_demo_hr; FK chain linked in the RPC.
  const JOB_TITLES = ['Senior Software Engineer', 'Product Manager', 'UX Designer', 'Account Executive', 'Customer Success Manager', 'Data Analyst', 'Marketing Lead', 'Operations Coordinator'];
  const DEPTS = ['Engineering', 'Product', 'Design', 'Sales', 'Customer Success', 'Data', 'Marketing', 'Operations'];
  const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'temporary'];
  const APP_STAGE = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
  const APP_SOURCE = ['LinkedIn', 'Referral', 'Job board', 'Website', 'Agency'];
  const IV_MODE = ['onsite', 'phone', 'video'];
  const IV_STATUS = ['scheduled', 'completed', 'scheduled', 'no_show'];
  const OFFER_STATUS = ['draft', 'sent', 'accepted', 'declined', 'expired'];
  const CAND = ['Avery Stone', 'Noah Patel', 'Lena Fischer', 'Marcus Webb', 'Yuki Tanaka', 'Sofia Russo', 'Ethan Cole', 'Hana Park', 'Liam Nasser', 'Zoe Adler', 'Carlos Mendez', 'Aisha Bello'];
  const N_JOBS = 8, N_APPS = 20, N_INTERVIEWS = 14, N_OFFERS = 8;
  const jobs: DemoJob[] = [];
  for (let i = 0; i < N_JOBS; i++) jobs.push({ title: JOB_TITLES[i % JOB_TITLES.length], department: DEPTS[i % DEPTS.length], location: ['Remote', 'Hybrid', 'On-site'][i % 3], employment_type: EMP_TYPES[i % EMP_TYPES.length], openings: (i % 3) + 1, status: 'open' });
  const applications: DemoApplication[] = [];
  for (let i = 0; i < N_APPS; i++) applications.push({ candidate_name: CAND[i % CAND.length], email: CAND[i % CAND.length].toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', source: APP_SOURCE[i % APP_SOURCE.length], stage: APP_STAGE[i % APP_STAGE.length], rating: (i % 5) + 1 });
  const interviews: DemoInterview[] = [];
  for (let i = 0; i < N_INTERVIEWS; i++) interviews.push({ mode: IV_MODE[i % IV_MODE.length], status: IV_STATUS[i % IV_STATUS.length], stage_label: ['Phone screen', 'Technical', 'Onsite', 'Final'][i % 4] });
  const offers: DemoOffer[] = [];
  for (let i = 0; i < N_OFFERS; i++) offers.push({ candidate_name: CAND[i % CAND.length], job_title: JOB_TITLES[i % JOB_TITLES.length], salary: [85000, 120000, 95000, 140000, 70000][i % 5], currency: 'USD', status: OFFER_STATUS[i % OFFER_STATUS.length] });

  // Accounting registers — seeded via tenant_seed_demo_accounting (financial-gated). Enum values match CHECKs.
  const SUB_SVC = ['Figma', 'Slack', 'Notion', 'GitHub', 'AWS', 'Zoom', 'Google Workspace', 'HubSpot', 'Datadog', 'Linear'];
  const subscriptions: DemoSubscription[] = SUB_SVC.map((service, i) => ({ service, category: ['Design', 'Comms', 'Productivity', 'Dev', 'Infra'][i % 5], plan_name: ['Pro', 'Team', 'Business'][i % 3], cost: [12, 15, 8, 21, 300, 40, 18, 90, 70, 10][i % 10], status: 'active' }));
  const DOMAIN_NAMES = ['shahzadrainer.com', 'snr-pmo.app', 'snrcloud.io', 'rainerlabs.dev', 'snrportal.co'];
  const DOMAIN_STATUS = ['active', 'active', 'active', 'expired', 'for_sale'];
  const domains: DemoDomain[] = DOMAIN_NAMES.map((domain, i) => ({ domain, registrar: ['Namecheap', 'GoDaddy', 'Cloudflare'][i % 3], cost: [12, 14, 9, 18, 11][i % 5], status: DOMAIN_STATUS[i % 5] }));
  const ASSET_TYPE = ['digital', 'physical', 'saas', 'domain', 'other'];
  const ASSET_NAMES = ['MacBook Pro fleet', 'Office furniture', 'Brand asset library', 'Server rack', 'Company vehicles', 'Software licenses', 'Camera kit', 'Trademark portfolio'];
  const ASSET_STATUS = ['active', 'active', 'retired', 'sold'];
  const assets: DemoAsset[] = ASSET_NAMES.map((name, i) => ({ name, asset_type: ASSET_TYPE[i % 5], value: [85000, 12000, 5000, 40000, 60000, 15000, 8000, 30000][i % 8], status: ASSET_STATUS[i % 4] }));
  const BANKS: [string, string, string, number][] = [['Operating Account', 'First National', 'checking', 128400], ['Payroll Account', 'First National', 'checking', 56200], ['Savings Reserve', 'Summit Bank', 'savings', 310000], ['Company Card', 'Amex', 'credit', -8400], ['Stripe Wallet', 'Stripe', 'wallet', 24300]];
  const bank_accounts: DemoBankAccount[] = BANKS.map(([label, bank_name, account_type, balance]) => ({ label, bank_name, account_type, balance }));
  const LIAB_TYPE = ['loan', 'credit_card', 'payable', 'accrued', 'other'];
  const LIAB: [string, number][] = [['SBA Term Loan', 420000], ['Equipment Lease', 58000], ['Vendor Payables', 23400], ['Accrued Bonuses', 41000], ['Line of Credit', 75000]];
  const LIAB_STATUS = ['active', 'active', 'active', 'paid', 'closed'];
  const liabilities: DemoLiability[] = LIAB.map(([name, principal], i) => ({ name, type: LIAB_TYPE[i % 5], principal, balance: Math.round(principal * 0.7), status: LIAB_STATUS[i % 5] }));
  const RECUR_CYCLE = ['weekly', 'monthly', 'quarterly', 'annual'];
  const RECUR: [string, string, number][] = [['Office rent', 'Facilities', 6500], ['Cloud hosting', 'Infra', 1800], ['Cleaning service', 'Facilities', 600], ['Accounting retainer', 'Professional', 1200], ['Insurance premium', 'Insurance', 2400], ['Internet & phone', 'Utilities', 450]];
  const RECUR_STATUS = ['active', 'active', 'paused', 'active'];
  const recurring: DemoRecurring[] = RECUR.map(([name, category, amount], i) => ({ name, category, amount, cycle: RECUR_CYCLE[i % 4], status: RECUR_STATUS[i % 4] }));

  // Receivables/payables + forms + drives — seeded via tenant_seed_demo_extras (per-feature gated).
  const VENDORS = ['Cloudflare', 'AWS', 'Staples', 'WeWork', 'Adobe', 'Atlassian', 'UPS', 'Verizon'];
  const BILL_STATUS = ['open', 'paid', 'overdue', 'open'];
  const bills: DemoBill[] = [];
  for (let i = 0; i < 10; i++) bills.push({ bill_number: `BILL-${tok}-${i + 1}`, vendor_name: VENDORS[i % VENDORS.length], amount: [1200, 450, 3800, 2600, 900, 1500, 700, 2100][i % 8], status: BILL_STATUS[i % 4] });
  const EXP_TITLES = ['Client dinner', 'Flight to conference', 'Hotel — offsite', 'Software license', 'Team lunch', 'Taxi fares', 'Co-working day pass', 'Printing'];
  const EXP_STATUS = ['draft', 'submitted', 'approved', 'paid', 'rejected'];
  const expense_claims: DemoExpenseClaim[] = EXP_TITLES.map((title, i) => ({ title, amount: [120, 540, 320, 99, 210, 45, 30, 80][i % 8], status: EXP_STATUS[i % 5] }));
  const CN_STATUS = ['open', 'applied', 'void'];
  const credit_notes: DemoCreditNote[] = [];
  for (let i = 0; i < 8; i++) credit_notes.push({ credit_number: `CN-${tok}-${i + 1}`, client_name: clients[i % clients.length], amount: [500, 1200, 300, 800, 150][i % 5], status: CN_STATUS[i % 3] });
  const FORM_NAMES = ['Contact us', 'Demo request', 'Newsletter signup', 'Support ticket', 'Job application', 'Event registration'];
  const FORM_STATUS = ['published', 'draft', 'archived'];
  const FORM_FIELDS = [{ key: 'full_name', label: 'Full name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'message', label: 'Message', type: 'textarea', required: false }];
  const forms: DemoForm[] = FORM_NAMES.map((name, i) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + tok + '-' + i, status: FORM_STATUS[i % 3], fields: FORM_FIELDS }));
  const DRIVE_NAMES = ['Company Documents', 'Client Deliverables', 'Marketing Assets', 'HR & Policies', 'Templates', 'Archive'];
  const drives: DemoDrive[] = DRIVE_NAMES.map((name) => ({ name, description: name + ' — shared workspace drive.' }));

  return { clients, projects, deals, ledger, companies, portfolios, teams, ideas, products, invoices, support, risks, automations, templates, leads, proposals, contracts, jobs, applications, interviews, offers, subscriptions, domains, assets, bank_accounts, liabilities, recurring, bills, expense_claims, credit_notes, forms, drives };
}


// Granular seeding: trim a full payload to a per-area selection (key -> count; 0 = exclude).
// Companies & portfolios are FOUNDATION (always kept) so cross-reference indices stay valid;
// project-linked refs in ledger/invoices/ideas are clamped to the trimmed project list.
export function trimDemoPayload(full: DemoPayload, sel: Record<string, number>, tasksPerProject?: number): DemoPayload {
  const take = <T,>(key: string, arr: T[]): T[] => {
    const n = sel[key];
    if (n === undefined) return arr;
    return n <= 0 ? [] : arr.slice(0, n);
  };
  let projects = take('projects', full.projects);
  if (tasksPerProject !== undefined) {
    const t = tasksPerProject;
    projects = projects.map((p) => ({ ...p, tasks: t <= 0 ? [] : p.tasks.slice(0, t) }));
  }
  const projLen = projects.length;
  const clampProj = (idx?: number) => (idx !== undefined && idx < projLen ? idx : undefined);
  return {
    clients: take('clients', full.clients),
    projects,
    companies: full.companies,
    portfolios: full.portfolios,
    deals: take('deals', full.deals),
    ledger: take('ledger', full.ledger).map((e) => ({ ...e, project_index: clampProj(e.project_index) })),
    teams: take('teams', full.teams),
    leads: take('leads', full.leads),
    proposals: take('proposals', full.proposals),
    contracts: take('contracts', full.contracts),
    jobs: take('jobs', full.jobs),
    applications: take('applications', full.applications),
    interviews: take('interviews', full.interviews),
    offers: take('offers', full.offers),
    subscriptions: take('subscriptions', full.subscriptions),
    domains: take('domains', full.domains),
    assets: take('assets', full.assets),
    bank_accounts: take('bank_accounts', full.bank_accounts),
    liabilities: take('liabilities', full.liabilities),
    recurring: take('recurring', full.recurring),
    bills: take('bills', full.bills),
    expense_claims: take('expense_claims', full.expense_claims),
    credit_notes: take('credit_notes', full.credit_notes),
    forms: take('forms', full.forms),
    drives: take('drives', full.drives),
    ideas: take('ideas', full.ideas).map((e) => ({ ...e, project_index: clampProj(e.project_index) })),
    products: take('products', full.products),
    invoices: take('invoices', full.invoices).map((e) => ({ ...e, project_index: clampProj(e.project_index) })),
    support: take('support', full.support),
    risks: take('risks', full.risks),
    automations: take('automations', full.automations),
    templates: take('templates', full.templates),
  };
}