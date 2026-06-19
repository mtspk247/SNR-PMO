/**
 * GroupHeader — shared presentational component for grouped lists/tables.
 * Matches the visual pattern from pages/tasks.tsx:
 *   - Subtle bg-surface2/70 bar
 *   - Uppercase tracked label + item count
 *   - Optional collapse toggle
 *   - Optional action button (add item)
 */
import { Icon } from '@/components/ui';

interface GroupHeaderProps {
  label: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Extra content to render on the right (e.g. an "Add" button). */
  action?: React.ReactNode;
  /** Render inside a <tr><td colSpan=…> for HTML tables. */
  asTableRow?: boolean;
  colSpan?: number;
}

export function GroupHeader({ label, count, collapsed, onToggle, action, asTableRow, colSpan }: GroupHeaderProps) {
  const inner = (
    <div className="flex items-center gap-2.5 px-4 py-2">
      {onToggle && (
        <button
          onClick={onToggle}
          className="shrink-0 text-muted2 hover:text-content transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <Icon name={collapsed ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-sm" />
        </button>
      )}
      <span className="text-2xs font-semibold uppercase tracking-wider text-muted leading-none">
        {label}
      </span>
      <span className="text-2xs font-medium text-muted2 tabular-nums">{count}</span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );

  if (asTableRow) {
    return (
      <tr className="bg-surface2/70 border-t border-line first:border-t-0">
        <td colSpan={colSpan ?? 99} className="p-0">
          {inner}
        </td>
      </tr>
    );
  }

  return (
    <div className="bg-surface2/70 border-t border-b border-line first:border-t-0">
      {inner}
    </div>
  );
}
