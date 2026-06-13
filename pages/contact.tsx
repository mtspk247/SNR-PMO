import PublicPage, { H2, P } from '@/components/PublicPage';

const CHANNELS = [
  { label: 'Sales & demos', email: 'sales@snr-pmo.app', desc: 'Pricing, white-label deployments, and live product walkthroughs.' },
  { label: 'Support', email: 'support@snr-pmo.app', desc: 'Help with your workspace, billing, or account.' },
  { label: 'Security', email: 'security@snr-pmo.app', desc: 'Report a vulnerability or ask about our security posture.' },
];

export default function Contact() {
  return (
    <PublicPage
      title="Contact us"
      subtitle="Talk to the team behind SNR-PMO — sales, support, or security."
      metaDescription="Get in touch with the SNR-PMO team for sales, demos, support, or security."
    >
      <div className="grid sm:grid-cols-3 gap-5">
        {CHANNELS.map((c) => (
          <div key={c.email} className="rounded-2xl border border-black/[0.07] p-6 hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,0.18)] hover:border-[#3ECF8E]/30 transition-all">
            <h3 className="text-base font-semibold text-[#0f0f0f]">{c.label}</h3>
            <p className="mt-2 text-sm text-[#52525b] leading-relaxed">{c.desc}</p>
            <a href={`mailto:${c.email}`} className="mt-4 inline-block text-sm font-semibold text-[#1f9d6c] hover:underline">{c.email}</a>
          </div>
        ))}
      </div>

      <H2>Want to see it live?</H2>
      <P>Email <a href="mailto:sales@snr-pmo.app" className="text-[#1f9d6c] underline">sales@snr-pmo.app</a> to book a guided demo, or <a href="/login" className="text-[#1f9d6c] underline">start a free workspace</a> and explore it yourself in minutes.</P>

      <P className="text-sm text-[#a1a1aa]"><em>Contact addresses shown are placeholders to be pointed at your real inboxes before launch.</em></P>
    </PublicPage>
  );
}
