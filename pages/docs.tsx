import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Icon, EmptyState } from '@/components/ui';

// ---------------------------------------------------------------------------
// Content model — structured data avoids any runtime markdown parsing
// ---------------------------------------------------------------------------

import { SECTIONS, sectionText } from '@/lib/docs';
import type { Block, Section } from '@/lib/docs';

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

export default function DocsPage() {
  const router = useRouter();
  const [active, setActive] = useState(SECTIONS[0].id);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Precompute lowercased search text per section.
  const index = useMemo(() => SECTIONS.map((sec) => ({ id: sec.id, text: sectionText(sec) })), []);
  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!q) return null;
    return new Set(index.filter((i) => i.text.includes(q)).map((i) => i.id));
  }, [q, index]);
  const visibleSections = matchIds ? SECTIONS.filter((s) => matchIds.has(s.id)) : SECTIONS;

  // Scroll a section into view within the content pane and flash a highlight.
  function goTo(id: string, smooth = true) {
    setActive(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      setHighlight(id);
      window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
    }
  }

  // Deep-link support: honour #anchor on first load and on hash changes so
  // contextual "?" links from anywhere in the app land on the right section.
  useEffect(() => {
    const applyHash = () => {
      const raw = (window.location.hash || '').replace(/^#/, '');
      if (raw && SECTIONS.some((s) => s.id === raw)) {
        setQuery('');
        // defer so the (possibly re-rendered) section exists in the DOM
        window.setTimeout(() => goTo(raw, false), 60);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.asPath]);

  return (
    <Layout flat title="Docs">
      <PageHeader
        title="System Guide"
        icon="ti-book-2"
        subtitle="The single source of truth — every module, how features connect, and the recommended operating workflow."
      />

      {/* Search */}
      <div className="relative mb-4 max-w-xl">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <Icon name="ti-search" className="text-sm" />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide…"
          className="input w-full pl-9 pr-9"
          aria-label="Search the guide"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-content"
            aria-label="Clear search"
          >
            <Icon name="ti-x" className="text-sm" />
          </button>
        )}
      </div>

      <div className="flex gap-6 items-start" style={{ height: 'calc(100vh - 13rem)' }}>
        {/* Left nav — sticky, hidden below lg */}
        <aside className="hidden lg:flex flex-col gap-0.5 w-52 shrink-0 h-full overflow-y-auto pr-1">
          {SECTIONS.map((s) => {
            const dimmed = matchIds ? !matchIds.has(s.id) : false;
            return (
              <button
                key={s.id}
                onClick={() => { setQuery(''); window.setTimeout(() => goTo(s.id), 0); }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors
                  ${active === s.id
                    ? 'bg-accent/10 text-accentstrong font-medium'
                    : dimmed
                      ? 'text-muted/40 hover:text-content hover:bg-surface2'
                      : 'text-muted hover:text-content hover:bg-surface2'}`}
              >
                <Icon name={s.icon} className="text-base shrink-0" />
                {s.title}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <div ref={contentRef} className="flex-1 min-w-0 space-y-6 h-full overflow-y-auto pr-1 pb-4">
          {visibleSections.length === 0 && (
            <EmptyState icon="ti-search-off" title="No matches" text={`Nothing in the guide matches "${query}". Try a different word.`} />
          )}
          {visibleSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={`card p-5 scroll-mt-2 transition-shadow duration-500 ${highlight === section.id ? 'ring-2 ring-accent/50' : ''}`}
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
