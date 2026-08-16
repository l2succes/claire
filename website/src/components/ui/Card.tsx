// SPDX-License-Identifier: Apache-2.0
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const cardVariants = cva('rounded-[var(--radius-md)] border border-neutral-200 p-7', {
  variants: {
    tint: {
      paper: 'bg-paper',
      lime: 'bg-lime',
      sky: 'bg-sky',
      blush: 'bg-blush',
      mint: 'bg-mint',
      cream: 'bg-cream',
    },
  },
  defaultVariants: {
    tint: 'paper',
  },
});

export function Card({
  children,
  tint,
  className,
}: { children: ReactNode; className?: string } & VariantProps<typeof cardVariants>) {
  return <article className={cn(cardVariants({ tint }), className)}>{children}</article>;
}

export { cardVariants };
