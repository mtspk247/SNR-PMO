// #8 Industry-specific demo-data generator. Builds the payload consumed by the
// tenant_seed_demo RPC. Vocabulary is keyed off the #9 taxonomy industries so each
// industry produces realistic projects/tasks/clients/deals/ledger in its own domain
// language. Falls back to a generic pack derived from the taxonomy for any industry
// without a bespoke entry.
import { TAXONOMY, INDUSTRIES } from './taxonomy';

export interface DemoTask { name: string; status?: string; priority?: string; estimated_hours?: number }
export interface DemoProject { name: string; description?: string; status?: string; priority?: string; progress?: number; tasks: DemoTask[] }
export interface DemoDeal { title: string; value: number; stage: string }
export interface DemoLedger { type: 'income' | 'expense'; category: string; amount: number; notes?: string; project_index?: number }
export interface DemoProduct { name: string; type?: string; unit_price?: number }
export interface DemoInvoiceLine { description: string; qty: number; unit_price: number }
export interface DemoInvoice { number: string; status?: string; lines: DemoInvoiceLine[] }
export interface DemoSupport { subject: string; category?: string; priority?: string; status?: string }
export interface DemoRisk { title: string; category?: string; impact?: number; probability?: number; status?: string }
export interface DemoPayload {
  clients: string[]; projects: DemoProject[]; deals: DemoDeal[]; ledger: DemoLedger[];
  companies: string[]; teams: string[]; ideas: string[];
  products: DemoProduct[]; invoices: DemoInvoice[]; support: DemoSupport[]; risks: DemoRisk[];
}

const T = (name: string, status: string, priority = 'Medium', h = 6): DemoTask => ({ name, status, priority, estimated_hours: h });
const STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Won'];

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

// Generic fallback built from the taxonomy for any industry without a bespoke pack.
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

export function buildDemoPayload(industry: string | null | undefined): DemoPayload {
  const ind = industry && INDUSTRIES.includes(industry) ? industry : '';
  const pack = (ind && PACKS[ind]) || genericPack(ind || 'Professional Services');
  const pstatus = ['In Progress', 'Planning', 'Completed'];
  const pprog = [55, 15, 100];
  const projects: DemoProject[] = pack.projects.map((p, i) => ({
    name: p.name,
    description: `${ind || 'Sample'} demo project — ${p.name}.`,
    status: pstatus[i % pstatus.length],
    priority: i === 0 ? 'High' : 'Medium',
    progress: pprog[i % pprog.length],
    tasks: [
      T(p.tasks[0], 'Done', 'Medium', 8),
      T(p.tasks[1], 'In Progress', 'High', 12),
      T(p.tasks[2], 'Backlog', 'Medium', 6),
    ],
  }));
  const deals: DemoDeal[] = pack.deals.map((title, i) => ({ title, value: [18000, 42000, 9500][i % 3], stage: STAGES[i % STAGES.length] }));
  const ledger: DemoLedger[] = [
    { type: 'income', category: pack.ledgerCats[0], amount: 24000, notes: 'Demo income', project_index: 0 },
    { type: 'income', category: pack.ledgerCats[0], amount: 11500, notes: 'Demo income', project_index: 1 },
    { type: 'expense', category: pack.ledgerCats[1], amount: 7800, notes: 'Demo expense', project_index: 0 },
    { type: 'expense', category: 'Software & tools', amount: 1200, notes: 'Demo expense' },
  ];
  // Plan-gated extras (RPC only seeds modules the tenant's plan enables).
  const companies: string[] = pack.clients.slice(0, 2);
  const teams: string[] = ['Delivery', 'Sales', 'Operations'];
  const ideas: string[] = [
    `${pack.projects[0].name} — phase 2`,
    'Customer feedback portal',
    'Internal process automation',
  ];
  const products: DemoProduct[] = [
    { name: `${ind || 'Standard'} service`, type: 'service', unit_price: 150 },
    { name: 'Premium package', type: 'service', unit_price: 500 },
    { name: 'Onboarding & setup', type: 'service', unit_price: 1000 },
  ];
  const tok = Math.random().toString(36).slice(2, 6).toUpperCase();
  const invoices: DemoInvoice[] = [
    { number: `INV-${tok}-1`, status: 'paid', lines: [{ description: products[0].name, qty: 10, unit_price: 150 }] },
    { number: `INV-${tok}-2`, status: 'sent', lines: [{ description: products[1].name, qty: 2, unit_price: 500 }, { description: products[2].name, qty: 1, unit_price: 1000 }] },
  ];
  const support: DemoSupport[] = [
    { subject: 'Cannot access the dashboard', category: 'Account', priority: 'high', status: 'open' },
    { subject: 'Question about my latest invoice', category: 'Billing', priority: 'medium', status: 'resolved' },
  ];
  const risks: DemoRisk[] = [
    { title: 'Client concentration risk', category: 'Strategic', impact: 4, probability: 3, status: 'Open' },
    { title: 'Supplier / delivery delay', category: 'Operational', impact: 3, probability: 2, status: 'Open' },
  ];
  return { clients: pack.clients, projects, deals, ledger, companies, teams, ideas, products, invoices, support, risks };
}
