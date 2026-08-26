// packages/db/src/schema/users.ts
//
// A user's identity comes entirely from Cognito (federated to Azure AD) -
// this table just links a Cognito subject to our own authorization data.
// Deliberately NOT storing name/profile fields here - Azure AD already owns
// that; duplicating it here would just create a second, staler copy.

import { pgTable, uuid, text, timestamp, primaryKey, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { clients } from './clients';

export const orgRole = pgEnum('org_role', ['admin', 'member']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  cognitoSub: text('cognito_sub').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Platform-level role, orthogonal to any Organization - Portalink staff only.
// A user can be a platform admin AND separately belong to Organizations; the
// two are independent, not a hierarchy.
export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),
});

// Which Organization(s) a user belongs to, and their role within each one.
// 'admin' implies access to every Client under that Organization - no row is
// needed in userClientAccess for an org-admin; access is derived, not granted.
export const userOrganizationRoles = pgTable(
  'user_organization_roles',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    role: orgRole('role').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.organizationId] }),
  }),
);

// Explicit per-Client grants - only meaningful for 'member' role users, since
// this is exactly the mechanism that walls off one end-customer's flows from
// another within the same agency (the confirmed requirement from scoping).
export const userClientAccess = pgTable(
  'user_client_access',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    clientId: uuid('client_id')
      .references(() => clients.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.clientId] }),
  }),
);
