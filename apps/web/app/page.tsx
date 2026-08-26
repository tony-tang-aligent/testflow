// apps/web/app/page.tsx
//
// Root redirects to the Client picker - matches Zapier/Shopify Flow's own
// behavior (you land on your list of workflows, not a marketing dashboard).
// A user with access to exactly one Client skips straight past this to their
// flows (see app/clients/page.tsx) - this redirect is just the entry point.

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/clients');
}
