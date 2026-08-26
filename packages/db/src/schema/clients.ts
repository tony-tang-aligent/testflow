// packages/db/src/schema/clients.ts
//
// A Client is an Organization's own end-customer - this is what `tenantId`
// already means throughout the entire flow engine (infra/lambda/shared/*).
// Creating a row here does NOT provision the client's actual flow-engine CDK
// stack - that's a deliberately separate, currently-manual step (see the
// scoping conversation on auto-provisioning: deferred until there's a proven
// need for it).

import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    // The actual tenantId used throughout infra/lambda/shared/ddb.ts etc -
    // deliberately a separate column from `id` (not reused) so the flow
    // engine's tenantId format can stay whatever it already is, independent
    // of this table's own primary key format.
    tenantId: text('tenant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdUnique: unique().on(table.tenantId),
  }),
);
