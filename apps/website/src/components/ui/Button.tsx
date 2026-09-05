// SPDX-License-Identifier: Apache-2.0
import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-3.5 rounded-full font-semibold transition-[transform,background,color] duration-180 hover:-translate-y-0.5',
  {
    variants: {
      variant: {
        dark: 'bg-ink text-paper hover:bg-neutral-800',
        lime: 'bg-lime text-ink hover:bg-lime-hover',
        outline: 'border border-ink bg-transparent text-ink hover:bg-neutral-100',
        quiet: 'bg-transparent text-ink hover:opacity-55',
      },
      size: {
        default: 'px-6 py-3.5',
        small: 'px-4.5 py-2.5 text-[13px] gap-3.5',
      },
    },
    defaultVariants: {
      variant: 'dark',
      size: 'default',
    },
  },
);

type ButtonProps = VariantProps<typeof buttonVariants> & {
  children: ReactNode;
  className?: string;
  href?: string;
} & Omit<ComponentProps<'button'>, 'children' | 'className'>;

export function Button({
  href,
  children,
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (href) {
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}

export { buttonVariants };
