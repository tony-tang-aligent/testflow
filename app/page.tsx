// web/app/page.tsx
//
// Root redirects straight to the flows list - matches Zapier/Shopify Flow's own
// behavior (you land on your list of workflows/Zaps, not a marketing dashboard).
// Server-side redirect, no client JS or loading flash involved.

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/flows');
}
