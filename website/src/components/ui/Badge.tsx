// SPDX-License-Identifier: Apache-2.0
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex w-fit items-center rounded-full border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase',
  {
    variants: {
      tone: {
        available: 'border-ink bg-lime text-ink',
        planned: 'border-neutral-200 bg-paper text-neutral-600',
        builder: 'border-ink bg-sky text-ink',
        warning: 'border-ink bg-blush text-ink',
        neutral: 'border-neutral-200 bg-paper text-ink',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export function Badge({
  children,
  tone,
  className,
}: { children: ReactNode; className?: string } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

export { badgeVariants };
