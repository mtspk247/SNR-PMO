import PublicPage, { H2, P, UL } from '@/components/PublicPage';

export default function Privacy() {
  return (
    <PublicPage
      title="Privacy Policy"
      subtitle="How SNR-PMO collects, uses, and protects data. Last updated June 2026."
      metaDescription="SNR-PMO privacy policy — what data we collect, how it is used, and your rights."
    >
      <P><strong>Summary.</strong> SNR-PMO is a multi-tenant SaaS platform. Each customer organization is an isolated tenant; we process your data to provide the service, not to sell it. We never sell personal data or share it with advertisers.</P>

      <H2>1. Data we collect</H2>
      <UL items={[
        'Account data: name, email, and authentication identifiers you provide at sign-up.',
        'Workspace content: the projects, tasks, contacts, employee records, and files your team creates in the product.',
        'Usage data: log and diagnostic information needed to operate, secure, and improve the service.',
      ]} />

      <H2>2. How we use data</H2>
      <UL items={[
        'To provide, maintain, and secure the platform for your organization.',
        'To authenticate users and enforce role- and tenant-based access controls.',
        'To provide support and to detect, prevent, and respond to abuse or security incidents.',
      ]} />

      <H2>3. Tenant isolation</H2>
      <P>All data is scoped to your organization at the database layer using row-level security. Users in one organization cannot access another organization’s data. Administrators within your organization control role-based access to data inside your workspace.</P>

      <H2>4. Sub-processors</H2>
      <P>We rely on a small set of infrastructure providers (for application hosting, database, authentication, and payment processing) to deliver the service. These providers process data only on our instructions and under contractual confidentiality and security obligations.</P>

      <H2>5. Data retention &amp; deletion</H2>
      <P>We retain workspace data for as long as your organization maintains an active account. On request or account closure, workspace data is deleted or anonymized within a commercially reasonable period, subject to legal retention requirements.</P>

      <H2>6. Your rights</H2>
      <P>Depending on your jurisdiction, you may have rights to access, correct, export, or delete personal data. Account owners can manage most data directly in the product; for other requests, contact us using the details on our contact page.</P>

      <H2>7. Contact</H2>
      <P>Questions about this policy can be sent via our <a href="/contact" className="text-[#1f9d6c] underline">contact page</a>.</P>

      <P><em>This document is a starting template provided with the product and should be reviewed by your legal counsel before public launch.</em></P>
    </PublicPage>
  );
}
