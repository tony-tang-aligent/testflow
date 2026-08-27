// apps/web/components/ui/badge.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-on-primary hover:bg-primary/80',
        secondary: 'border-transparent bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
        destructive: 'border-transparent bg-error text-on-error hover:bg-error/80',
        outline: 'text-on-surface',
        success: 'border-transparent bg-secondary-container/20 text-secondary border border-secondary/30',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
