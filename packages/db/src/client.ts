// packages/db/src/client.ts
//
// RDS Data API, not a direct Postgres driver - confirmed during scoping that
// Aurora Serverless v2 + PostgreSQL fully supports Data API (redesigned Dec
// 2023, no rate limit). This is what lets both apps/web's Next.js server AND
// infra's Lambda handlers share this exact same package with zero VPC
// networking, since Data API is just HTTPS calls to the RDS control plane.

import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import * as schema from './schema';

export interface DbConfig {
  resourceArn: string; // the Aurora cluster's ARN
  secretArn: string; // Secrets Manager secret holding the DB credentials
  database: string;
  region?: string;
}

/**
 * Creates a fresh Drizzle client per call - cheap, since Data API has no
 * persistent connection to open/close (unlike a normal pg driver). Both the
 * Next.js server and Lambda handlers call this the same way, reading config
 * from their own environment variables.
 */
export function createDb(config: DbConfig) {
  const client = new RDSDataClient({ region: config.region });
  return drizzle(client, {
    database: config.database,
    resourceArn: config.resourceArn,
    secretArn: config.secretArn,
    schema,
  });
}

export function dbConfigFromEnv(): DbConfig {
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  const database = process.env.DB_NAME ?? 'order_validator';
  if (!resourceArn || !secretArn) {
    throw new Error('DB_CLUSTER_ARN and DB_SECRET_ARN must be set - see infra/lib/identity-stack.ts');
  }
  return { resourceArn, secretArn, database };
}
