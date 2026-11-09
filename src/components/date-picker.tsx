'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatIsoDate, formatIsoDateShort, parseIsoDate, toIsoDate, todayIso } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/*
 * The one date picker. Every date a person sets in the product — a task's
 * estimate and actual, a date field, a holiday, a token's expiry — goes
 * through here, so they all look, read and answer the keyboard the same way.
 *
 * Values are `yyyy-MM-dd` strings or null, exactly as the API carries them;
 * nothing here knows about timestamps or time zones beyond "today", which is
 * Bangkok's.
 *
 * Two looks:
 *   - `field` — a house field (white, field-line border, 4px) for forms;
 *   - `cell`  — no chrome, for the List's in-place edit. It opens at once,
 *     and closing it without a choice is a cancel (`onDismiss`).
 */

const NON_WORKING = { dayOfWeek: [0, 6] };

type DatePickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  variant?: 'field' | 'cell';
  placeholder?: string;
  disabled?: boolean;
  /** Offer a Clear action. Off where an empty value is not allowed. */
  clearable?: boolean;
  /** The earliest day that may be chosen, `yyyy-MM-dd`. */
  min?: string;
  /** Open on mount (the List's cell editor). */
  defaultOpen?: boolean;
  /** Closed without choosing — Escape, a click outside, Tab away. */
  onDismiss?: () => void;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export function DatePicker({
  value, onChange, variant = 'field', placeholder = 'Pick a date', disabled, clearable = true,
  min, defaultOpen = false, onDismiss, id, className, ...aria
}: DatePickerProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [today] = React.useState(todayIso);
  const valueId = React.useId();
  // Inside a modal <dialog> the popover must portal into the dialog, which is
  // the top layer; anywhere else, into <body>.
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const triggerRef = React.useCallback((el: HTMLButtonElement | null) => {
    setContainer(el?.closest('dialog') ?? null);
  }, []);

  const selected = parseIsoDate(value);
  const label = variant === 'cell' ? formatIsoDateShort(value) : formatIsoDate(value);
  const earliest = parseIsoDate(min);

  function close(chose: boolean) {
    setOpen(false);
    if (!chose) onDismiss?.();
  }

  function choose(next: string | null) {
    close(true);
    if (next !== (value ?? null)) onChange(next);
    else onDismiss?.();
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close(false))}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          data-slot="date-picker"
          data-empty={label ? undefined : ''}
          data-value={value ?? ''}
          aria-label={aria['aria-label'] ? `${aria['aria-label']}${label ? `, ${label}` : ''}` : undefined}
          // A field's own label and the date it holds, read together.
          aria-labelledby={aria['aria-labelledby'] ? `${aria['aria-labelledby']} ${valueId}` : undefined}
          className={cn(
            'inline-flex min-w-0 cursor-pointer items-center gap-2 text-left tabular-nums text-foreground outline-none disabled:cursor-not-allowed',
            variant === 'field' && [
              'h-[34px] w-full rounded-xs border border-input bg-background px-2.5 text-[14px] transition-[border-color,box-shadow] duration-[120ms]',
              'hover:border-[var(--color-ink-faint)] focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_var(--brand-glow),var(--shadow-1)] focus-visible:outline-none',
              'data-[state=open]:border-ring data-[state=open]:shadow-[0_0_0_3px_var(--brand-glow),var(--shadow-1)]',
              'disabled:bg-muted disabled:text-muted-foreground disabled:hover:border-input',
            ],
            variant === 'cell' && 'h-[23px] w-full border-0 bg-transparent p-0 text-[13px] focus-visible:outline-none',
            className,
          )}
        >
          {variant === 'field' && <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
          <span id={valueId} className={cn('truncate', !label && 'text-[var(--color-ink-faint)]')}>{label ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="start"
        className="w-auto p-0"
        // Let the calendar put focus on the chosen day (or today) itself.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // The popover is portalled, but React still bubbles its events through
        // the tree: a click or an arrow key must not reach the List's grid.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          // Radix closes the picker on Escape; stopping the key's default
          // keeps a modal <dialog> around it from closing too.
          if (e.key === 'Escape') e.preventDefault();
        }}
      >
        <Calendar
          mode="single"
          autoFocus
          captionLayout="dropdown"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2035, 11)}
          selected={selected}
          defaultMonth={selected ?? parseIsoDate(today)}
          today={parseIsoDate(today)}
          disabled={earliest ? { before: earliest } : undefined}
          modifiers={{ nonWorking: NON_WORKING }}
          onSelect={(day) => { if (day) choose(toIsoDate(day)); }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[13px]"
            disabled={!!earliest && today < (min ?? '')}
            onClick={() => choose(today)}
          >
            Today
          </Button>
          {clearable && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[13px]"
              disabled={!value}
              onClick={() => choose(null)}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
