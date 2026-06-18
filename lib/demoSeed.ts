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
export interface DemoPayload {
  clients: string[]; projects: DemoProject[]; deals: DemoDeal[]; ledger: DemoLedger[];
  companies: string[]; portfolios: DemoPortfolio[]; teams: string[]; ideas: DemoIdea[];
  products: DemoProduct[]; invoices: DemoInvoice[]; support: DemoSupport[]; risks: DemoRisk[];
  automations: DemoAutomation[]; templates: DemoTemplate[];
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

  return { clients, projects, deals, ledger, companies, portfolios, teams, ideas, products, invoices, support, risks, automations, templates };
}
