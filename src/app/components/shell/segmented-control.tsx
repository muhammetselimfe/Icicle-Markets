import { cn } from '@/app/components/ui/utils';

export interface Segment<T extends string> {
  id: T;
  label: string;
  /** Small count or status shown after the label. */
  badge?: string | number;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Stretch segments to fill the container width. */
  fullWidth?: boolean;
  /** `elevated` for use on a surface, where the default selected fill would blend in. */
  tone?: 'default' | 'elevated';
  className?: string;
  'aria-label'?: string;
}

/** HIG-style segmented control: one selected segment, keyboard navigable, 44pt tall. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  fullWidth,
  tone = 'default',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const selectedClass = tone === 'elevated' ? 'bg-ice-surface2 text-ice-text shadow-sm' : 'bg-ice-surface text-ice-text shadow-sm';
  const onKeyDown = (e: React.KeyboardEvent) => {
    const index = segments.findIndex((s) => s.id === value);
    if (e.key === 'ArrowRight') onChange(segments[(index + 1) % segments.length].id);
    if (e.key === 'ArrowLeft') onChange(segments[(index - 1 + segments.length) % segments.length].id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex p-1 rounded-xl bg-ice-line/[0.08] min-h-[44px]',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.id === value;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(segment.id)}
            className={cn(
              'flex items-center justify-center gap-1.5 px-4 rounded-lg text-[14px] font-medium whitespace-nowrap transition-colors',
              fullWidth && 'flex-1',
              selected ? selectedClass : 'text-ice-muted hover:text-ice-text',
            )}
          >
            {segment.label}
            {segment.badge !== undefined && (
              <span className={cn('text-[12px] tabular-nums', selected ? 'text-ice-muted' : 'text-ice-faint')}>
                {segment.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
