// #9 Industry → Category → Business-type taxonomy (global reference data).
// Drives the tenant profile industry/category dropdowns and the #8 industry-specific
// demo-seed generators. Reference data is identical for every tenant, so it lives in
// code (no per-tenant rows / RLS); promote to a managed list later if tenants need to edit.

export interface TaxCategory { name: string; types: string[] }
export interface TaxIndustry { name: string; categories: TaxCategory[] }

export const TAXONOMY: TaxIndustry[] = [
  { name: 'Technology & Software', categories: [
    { name: 'SaaS / Software', types: ['B2B SaaS', 'Dev tools', 'API platform', 'Vertical SaaS'] },
    { name: 'IT Services', types: ['Managed services (MSP)', 'System integrator', 'IT consulting'] },
    { name: 'Hardware / IoT', types: ['Electronics', 'Devices', 'Embedded'] },
    { name: 'Data / AI', types: ['Analytics', 'ML/AI', 'Data platform'] },
    { name: 'Cybersecurity', types: ['Security software', 'SOC services'] },
  ]},
  { name: 'Professional Services', categories: [
    { name: 'Consulting', types: ['Management', 'Strategy', 'Operations'] },
    { name: 'Marketing & Advertising', types: ['Agency', 'PR', 'SEO/SEM', 'Social', 'Branding'] },
    { name: 'Legal', types: ['Law firm', 'Legal services', 'IP'] },
    { name: 'Accounting & Finance', types: ['Bookkeeping', 'Audit', 'Tax', 'CFO services'] },
    { name: 'HR & Recruiting', types: ['Staffing', 'Executive search', 'Payroll services'] },
    { name: 'Architecture & Engineering', types: ['Architecture firm', 'Civil/MEP engineering', 'Surveying'] },
  ]},
  { name: 'Construction & Real Estate', categories: [
    { name: 'Construction', types: ['General contractor', 'Subcontractor', 'Civil works'] },
    { name: 'Real Estate', types: ['Brokerage', 'Property management', 'REIT'] },
    { name: 'Trades', types: ['Electrical', 'Plumbing', 'HVAC', 'Landscaping'] },
    { name: 'Facilities', types: ['Maintenance', 'Cleaning', 'Security services'] },
  ]},
  { name: 'Healthcare & Life Sciences', categories: [
    { name: 'Providers', types: ['Clinic', 'Hospital', 'Dental', 'Physiotherapy', 'Mental health'] },
    { name: 'Pharma / Biotech', types: ['Drug development', 'Labs'] },
    { name: 'Medical Devices', types: ['Device manufacturing', 'Distribution'] },
    { name: 'Wellness', types: ['Fitness', 'Spa', 'Nutrition'] },
  ]},
  { name: 'Education', categories: [
    { name: 'Schools', types: ['K-12', 'Preschool', 'Tutoring center'] },
    { name: 'Higher Ed', types: ['University', 'College'] },
    { name: 'EdTech', types: ['Online courses', 'LMS', 'Training'] },
    { name: 'Training', types: ['Corporate training', 'Certification', 'Coaching'] },
  ]},
  { name: 'Retail & E-commerce', categories: [
    { name: 'E-commerce', types: ['Online store', 'Marketplace', 'DTC brand'] },
    { name: 'Brick & Mortar', types: ['Retail shop', 'Boutique', 'Franchise'] },
    { name: 'Wholesale / Distribution', types: ['Distributor', 'Importer/exporter'] },
    { name: 'Consumer Goods', types: ['Apparel', 'Electronics', 'Home goods'] },
  ]},
  { name: 'Manufacturing & Industrial', categories: [
    { name: 'Manufacturing', types: ['Discrete', 'Process', 'Contract manufacturing'] },
    { name: 'Automotive', types: ['OEM', 'Parts', 'Dealership'] },
    { name: 'Aerospace & Defense', types: [] },
    { name: 'Energy & Utilities', types: ['Oil & gas', 'Renewables', 'Utilities'] },
    { name: 'Agriculture', types: ['Farming', 'Agritech', 'Food production'] },
  ]},
  { name: 'Hospitality & Services', categories: [
    { name: 'Food & Beverage', types: ['Restaurant', 'Cafe', 'Catering', 'Cloud kitchen'] },
    { name: 'Hospitality', types: ['Hotel', 'Resort', 'Travel agency', 'Tourism'] },
    { name: 'Events', types: ['Event management', 'Venue', 'Wedding planning'] },
    { name: 'Personal Services', types: ['Salon', 'Photography', 'Fitness studio'] },
  ]},
  { name: 'Financial Services', categories: [
    { name: 'Banking & Lending', types: ['Bank', 'Credit union', 'Lender'] },
    { name: 'Insurance', types: ['Carrier', 'Brokerage', 'Insurtech'] },
    { name: 'Investment', types: ['Asset management', 'VC/PE', 'Wealth advisory'] },
    { name: 'Fintech', types: ['Payments', 'Neobank', 'Crypto'] },
  ]},
  { name: 'Media & Creative', categories: [
    { name: 'Media & Entertainment', types: ['Production', 'Publishing', 'Streaming'] },
    { name: 'Creative Agency', types: ['Design studio', 'Video', 'Content'] },
    { name: 'Gaming', types: [] },
    { name: 'Music & Arts', types: [] },
  ]},
  { name: 'Logistics & Transportation', categories: [
    { name: 'Logistics', types: ['Freight', '3PL', 'Warehousing'] },
    { name: 'Transportation', types: ['Trucking', 'Courier/last-mile', 'Fleet'] },
    { name: 'Maritime / Aviation', types: [] },
  ]},
  { name: 'Nonprofit & Public', categories: [
    { name: 'Nonprofit', types: ['Charity', 'Foundation', 'NGO'] },
    { name: 'Government / Public Sector', types: [] },
    { name: 'Membership / Association', types: [] },
    { name: 'Religious / Community', types: [] },
  ]},
  { name: 'Telecom', categories: [
    { name: 'Telecom Operator', types: [] },
    { name: 'ISP', types: [] },
    { name: 'Network Services', types: [] },
  ]},
];

export const INDUSTRIES: string[] = TAXONOMY.map((i) => i.name);

export function categoriesFor(industry: string | null | undefined): string[] {
  const ind = TAXONOMY.find((i) => i.name === industry);
  return ind ? ind.categories.map((c) => c.name) : [];
}

// Build Select options, including any current free-text value not in the list (legacy data).
export function withCurrent(values: string[], current: string | null | undefined): { value: string; label: string }[] {
  const opts = values.map((v) => ({ value: v, label: v }));
  if (current && !values.includes(current)) opts.unshift({ value: current, label: current });
  return opts;
}
