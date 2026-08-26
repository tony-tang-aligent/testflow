// packages/db/src/migrate.ts
//
//  drizzle.config.ts and package.json's
// db:generate/db:migrate scripts existed, but nothing here ever actually
// applied a migration to real Aurora. That's the actual reason "relation
// does not exist" happened: the database genuinely has zero tables, not a
// permissions or connectivity problem.
//
// Run in order:
//   npm run db:generate   (from packages/db - turns schema/*.ts into SQL files under ./drizzle)
//   npm run db:migrate    (this file - applies those SQL files to real Aurora)
// Needs DB_CLUSTER_ARN/DB_SECRET_ARN/DB_NAME set in the environment
// (packages/db/.env or exported directly) - same values used everywhere else
// in this project, from IdentityStack's CDK outputs.

import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import { createDb, dbConfigFromEnv } from './client';

async function run() {
    const db = createDb(dbConfigFromEnv());
    console.log('Applying migrations from ./drizzle ...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Done.');
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});