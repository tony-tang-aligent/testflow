// packages/db/src/schema/organizations.ts
//
// The top level of the org hierarchy - an agency (a Portalink partner), not an
// end-customer. End-customers are Clients (see clients.ts), owned by an
// Organization. Deliberately no country/region fields yet - that whole layer
// was scoped and explicitly deferred; adding it later is additive columns,
// not a redesign.

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
