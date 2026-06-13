import PublicPage, { H2, P, UL } from '@/components/PublicPage';

export default function Security() {
  return (
    <PublicPage
      title="Security"
      subtitle="How SNR-PMO protects your data. Last updated June 2026."
      metaDescription="SNR-PMO security overview — tenant isolation, access control, and data protection."
    >
      <P>Security is built into the architecture of SNR-PMO, not bolted on. Below is an overview of the controls that protect your organization’s data.</P>

      <H2>Tenant isolation by default</H2>
      <P>Every record in the platform is scoped to an organization and enforced by database row-level security (RLS). Access rules are applied at the data layer, so application code cannot accidentally leak data across tenants. Write paths are designed to fail closed.</P>

      <H2>Authentication &amp; access control</H2>
      <UL items={[
        'Managed authentication with email/password and OAuth sign-in.',
        'Granular, role-based permissions at the organization, company, portfolio, and project levels.',
        'Seat- and feature-level entitlements enforced server-side, not just hidden in the UI.',
      ]} />

      <H2>Auditability</H2>
      <P>Key actions across core tables are captured automatically by database triggers into an immutable audit log, giving administrators a clear, exportable trail for reviews and compliance.</P>

      <H2>Infrastructure</H2>
      <UL items={[
        'Hosted on managed, reputable cloud infrastructure with encryption in transit.',
        'Secrets and payment credentials are stored in the platform configuration layer, never in client code.',
        'Regular dependency and configuration review.',
      ]} />

      <H2>Reporting a vulnerability</H2>
      <P>If you believe you have found a security issue, please reach out through our <a href="/contact" className="text-[#1f9d6c] underline">contact page</a>. We appreciate responsible disclosure and will respond promptly.</P>

      <P><em>This overview describes the platform’s security model and should be tailored to your deployment and reviewed before sharing with customers.</em></P>
    </PublicPage>
  );
}
