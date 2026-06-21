import Link from 'next/link';

/**
 * Clickable parent-entity reference for list cells (project / company / portfolio /
 * deal …). Navigates to the entity on click; stops row-open propagation; pointer
 * cursor + hover colour, NO underline (per the list-UX rules). Page supplies href.
 */
export default function RefLink({ href, label, className = '' }: { href: string; label: string; className?: string }) {
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} title={label}
      className={`truncate inline-block max-w-full align-middle cursor-pointer hover:text-accentstrong transition ${className}`}>
      {label}
    </Link>
  );
}
