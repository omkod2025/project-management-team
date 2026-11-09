'use client';

import * as React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayButton, DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

/*
 * shadcn's Calendar (react-day-picker v9), answered by the house:
 *   - the chosen day is the house blue, the one colour that means "you are here";
 *   - today is the datum (DESIGN.md § 9.4): datum ink and a 2px datum rule
 *     under the figure — not blue, because blue means action;
 *   - figures are Inter with tabular numerals, so the grid column-aligns;
 *   - a `nonWorking` modifier draws a day on paper, as the Timeline does.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-background p-3 tabular-nums [--cell-size:--spacing(8.5)] [[data-slot=popover-content]_&]:bg-transparent',
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('en-US', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-3', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-md border border-border has-focus:border-ring has-focus:ring-[3px] has-focus:ring-[var(--brand-glow)]',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn('absolute inset-0 cursor-pointer bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-semibold select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        month_grid: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-md text-[12px] font-semibold text-muted-foreground select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-1 flex w-full', defaultClassNames.week),
        day: cn('group/day relative aspect-square h-full w-full p-0 text-center select-none', defaultClassNames.day),
        today: cn('', defaultClassNames.today),
        outside: cn('text-[var(--color-ink-faint)]', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...rootProps} />
        ),
        Chevron: ({ className, orientation, ...chevronProps }) => {
          if (orientation === 'left') return <ChevronLeftIcon className={cn('size-4', className)} {...chevronProps} />;
          if (orientation === 'right') return <ChevronRightIcon className={cn('size-4', className)} {...chevronProps} />;
          return <ChevronDownIcon className={cn('size-4', className)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.isoDate}
      data-selected-single={modifiers.selected || undefined}
      data-today={modifiers.today || undefined}
      data-non-working={modifiers.nonWorking || undefined}
      data-outside={modifiers.outside || undefined}
      className={cn(
        'relative flex aspect-square size-auto w-full min-w-(--cell-size) rounded-md text-[13px] leading-none font-normal text-foreground',
        'data-[non-working]:bg-muted data-[non-working]:hover:bg-[rgb(0_0_0/7%)]',
        'data-[outside]:text-[var(--color-ink-faint)]',
        'data-[today]:font-semibold data-[today]:text-[var(--color-datum)]',
        "data-[today]:after:absolute data-[today]:after:bottom-1 data-[today]:after:left-1/2 data-[today]:after:h-0.5 data-[today]:after:w-3 data-[today]:after:-translate-x-1/2 data-[today]:after:rounded-full data-[today]:after:bg-[var(--color-datum)] data-[today]:after:content-['']",
        'data-[selected-single]:bg-primary data-[selected-single]:font-semibold data-[selected-single]:text-primary-foreground data-[selected-single]:hover:bg-[var(--color-primary-active)] data-[selected-single]:after:bg-primary-foreground',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[selected-single]:focus-visible:outline-offset-2',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
