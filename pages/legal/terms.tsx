import PublicPage, { H2, P, UL } from '@/components/PublicPage';

export default function Terms() {
  return (
    <PublicPage
      title="Terms of Service"
      subtitle="The agreement governing your use of SNR-PMO. Last updated June 2026."
      metaDescription="SNR-PMO terms of service."
    >
      <H2>1. Agreement</H2>
      <P>By creating an account or using SNR-PMO (the “Service”), you agree to these Terms. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization.</P>

      <H2>2. Accounts &amp; access</H2>
      <UL items={[
        'You are responsible for safeguarding your credentials and for activity under your account.',
        'Organization owners and admins control roles, permissions, and membership within their workspace.',
        'You must provide accurate information and keep it current.',
      ]} />

      <H2>3. Subscriptions &amp; billing</H2>
      <P>Paid plans are billed in advance on a recurring basis according to the plan you select. Fees are non-refundable except where required by law. You can upgrade, downgrade, or cancel from your billing settings; changes take effect according to your plan’s billing cycle.</P>

      <H2>4. Acceptable use</H2>
      <UL items={[
        'Do not use the Service to violate law or infringe the rights of others.',
        'Do not attempt to breach tenant isolation, probe security controls, or disrupt the Service.',
        'Do not upload malicious code or content you lack the right to store.',
      ]} />

      <H2>5. Your data</H2>
      <P>You retain ownership of the content your organization creates in the Service. You grant us the limited rights needed to host and operate the Service on your behalf. Our handling of personal data is described in the <a href="/legal/privacy" className="text-[#1f9d6c] underline">Privacy Policy</a>.</P>

      <H2>6. Availability &amp; warranties</H2>
      <P>We work to keep the Service available and secure but provide it “as is” without warranties except those that cannot be excluded by law. We are not liable for indirect or consequential damages to the extent permitted by law.</P>

      <H2>7. Changes &amp; termination</H2>
      <P>We may update these Terms; material changes will be communicated through the Service. You may stop using the Service at any time. We may suspend access for violations of these Terms.</P>

      <P><em>This document is a starting template provided with the product and should be reviewed by your legal counsel before public launch.</em></P>
    </PublicPage>
  );
}
