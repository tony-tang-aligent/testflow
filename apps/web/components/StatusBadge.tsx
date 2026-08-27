// web/components/StatusBadge.tsx
import React from 'react';

const STYLES: Record<string, string> = {
  passed: 'bg-secondary-container/20 text-secondary border-secondary/30',
  warned: 'bg-tertiary-container/20 text-tertiary border-tertiary/30',
  failed: 'bg-error-container/20 text-error border-error/30',
  needs_review: 'bg-primary-container/20 text-primary border-primary/30',
};

const ICONS: Record<string, string> = {
  passed: 'check_circle',
  warned: 'warning',
  failed: 'cancel',
  needs_review: 'visibility',
};

const LABELS: Record<string, string> = {
  needs_review: 'needs review',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? 'bg-surface-variant text-on-surface-variant border-outline-variant';
  const icon = ICONS[status];
  return (
    <span
      className={`inline-flex items-center gap-xs rounded border px-2 py-0.5 font-code-sm text-code-sm uppercase ${cls}`}
    >
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {LABELS[status] ?? status}
    </span>
  );
}
