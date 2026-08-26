// infra/lambda/shared/ddb.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { FlowDefinition, Rule } from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const RULE_TABLE = process.env.RULE_TABLE_NAME ?? 'RuleStore';
const FLOW_TABLE = process.env.FLOW_TABLE_NAME ?? 'FlowDefinition';
const SUMMARY_TABLE = process.env.SUMMARY_TABLE_NAME ?? 'ValidationExecutionSummary';
const INTERNAL_TABLE = process.env.INTERNAL_TABLE_NAME ?? 'InternalLookup';

export async function getFlowDefinition(tenantId: string, flowId: string): Promise<FlowDefinition | null> {
  const res = await client.send(
    new GetCommand({
      TableName: FLOW_TABLE,
      Key: { tenantId, flowId },
    }),
  );
  return (res.Item as FlowDefinition) ?? null;
}

/** All flows belonging to a tenant - powers the /flows list page. One Query, since
 * FlowDefinition's partition key is tenantId and sort key is flowId. */
export async function listFlowDefinitions(tenantId: string): Promise<FlowDefinition[]> {
  const res = await client.send(
    new QueryCommand({
      TableName: FLOW_TABLE,
      KeyConditionExpression: 'tenantId = :t',
      ExpressionAttributeValues: { ':t': tenantId },
    }),
  );
  return (res.Items as FlowDefinition[]) ?? [];
}

export async function getActiveRules(tenantId: string, flowId: string, ruleIds: string[]): Promise<Rule[]> {
  if (ruleIds.length === 0) return [];
  const rules: Rule[] = [];
  for (const ruleId of ruleIds) {
    const res = await client.send(
      new GetCommand({
        TableName: RULE_TABLE,
        Key: { tenantId, ruleId },
      }),
    );
    if (res.Item && (res.Item as Rule).active && (res.Item as Rule).flowId === flowId) {
      rules.push(res.Item as Rule);
    }
  }
  return rules;
}

export async function getAllActiveRulesForScope(
  tenantId: string,
  flowId: string,
  scopeId: string,
): Promise<Rule[]> {
  // GSI: tenantId + flowId - see CDK stack for definition. Active/scopeId filtered
  // client-side, matching the existing pattern (rule counts per flow are expected
  // to be small; revisit with a composite sort key if that stops being true).
  const res = await client.send(
    new QueryCommand({
      TableName: RULE_TABLE,
      IndexName: 'byFlow',
      KeyConditionExpression: 'tenantId = :t AND flowId = :f',
      ExpressionAttributeValues: { ':t': tenantId, ':f': flowId },
    }),
  );
  return ((res.Items as Rule[]) ?? []).filter((r) => r.active && r.scopeId === scopeId);
}

export async function putExecutionSummary(item: Record<string, unknown>): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: SUMMARY_TABLE,
      Item: item,
    }),
  );
}

/**
 * A lookup against data the flow system itself owns - not an external system,
 * so it's always the same table regardless of which ERP adapter a flow uses.
 * `internalTable` is a caller-chosen logical namespace (e.g. 'customerCreditLimits');
 * `key` identifies one record within it. Read-only from the rule engine's side -
 * writing into this store is a separate mechanism (not part of rule evaluation),
 * e.g. a sync job or a future API route.
 */
export async function getInternalRecord(
  tenantId: string,
  internalTable: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const res = await client.send(
    new GetCommand({
      TableName: INTERNAL_TABLE,
      Key: { tenantId, lookupKey: `${internalTable}:${key}` },
    }),
  );
  return (res.Item?.data as Record<string, unknown>) ?? null;
}
