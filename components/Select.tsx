import Dropdown from '@/components/Dropdown';
import { Icon } from '@/components/ui';

/**
 * Drop-in replacement for native <select>, rendered with the app's custom Dropdown
 * (smooth menu, consistent radius/hover, search). Use everywhere instead of <select>.
 */
export default function Select({ value, onChange, options, placeholder = 'Select…', disabled, search, width, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  search?: boolean;
  width?: number;
  className?: string;
}) {
  const cur = options.find((o) => o.value === value);
  return (
    <Dropdown value={value} onChange={onChange} items={options} disabled={disabled} search={search} width={width}
      trigger={
        <span className={`input flex items-center justify-between gap-2 cursor-pointer ${className}`}>
          <span className={`truncate ${cur ? 'text-content' : 'text-muted2'}`}>{cur?.label ?? placeholder}</span>
          <Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" />
        </span>
      } />
  );
}
