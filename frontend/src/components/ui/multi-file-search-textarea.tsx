import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';

interface MultiFileSearchTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  projectId?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  maxRows?: number;
}

export function MultiFileSearchTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className,
  onKeyDown,
  maxRows = 10,
}: MultiFileSearchTextareaProps) {
  return (
    <AutoExpandingTextarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={className}
      onKeyDown={onKeyDown}
      maxRows={maxRows}
    />
  );
}
