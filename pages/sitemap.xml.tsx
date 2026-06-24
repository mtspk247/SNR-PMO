/**
 * Dynamic XML sitemap served at /sitemap.xml. Lists the public marketing
 * surfaces incl. the programmatic /vs/<competitor> SEO pages so search
 * engines discover and crawl them. Referenced from public/robots.txt.
 */
import type { GetServerSideProps } from 'next';
import { COMPETITORS } from '@/lib/vsCompetitors';

const BASE = 'https://snr-pmo.vercel.app';

const PAGES: { path: string; priority: string; freq: string }[] = [
  { path: '/', priority: '1.0', freq: 'weekly' },
  { path: '/vs', priority: '0.8', freq: 'weekly' },
  { path: '/alternatives', priority: '0.9', freq: 'weekly' },
  { path: '/savings', priority: '0.8', freq: 'monthly' },
  ...COMPETITORS.map((c) => ({ path: `/vs/${c.slug}`, priority: '0.8', freq: 'monthly' })),
];

export default function SiteMap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const now = new Date().toISOString().slice(0, 10);
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PAGES.map((p) =>
      `  <url><loc>${BASE}${p.path}</loc><lastmod>${now}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`,
    ).join('\n') +
    `\n</urlset>\n`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate');
  res.write(body);
  res.end();
  return { props: {} };
};
