import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * shadcn's Button, with its variants answered by the house (DESIGN.md § 7):
 * `default` is the primary blue pill, `outline` the utility button (white,
 * hairline, 8px), `ghost` the quiet button, `destructive` danger red — never
 * vermilion, which means out of closure.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-[120ms] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'rounded-full bg-primary text-primary-foreground hover:bg-[var(--color-primary-active)]',
        destructive: 'rounded-md border border-border bg-background text-destructive hover:bg-[var(--color-danger-wash)]',
        outline: 'rounded-md border border-border bg-background text-foreground hover:border-input hover:bg-muted',
        secondary: 'rounded-full bg-background text-foreground shadow-[var(--shadow-1)] hover:bg-muted',
        ghost: 'rounded-md bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-[3px] hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
