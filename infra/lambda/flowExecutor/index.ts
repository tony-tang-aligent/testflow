// infra/lambda/flowExecutor/index.ts
//
// The DEFAULT executor - handles every built-in node type via the switch
// below, but is no longer the only possible executor. A node type in
// nodeRegistry.ts can set its own executorArn to route to a completely
// different Lambda instead (a trusted partner's marketplace node, per spec
// §8) - the compiler embeds that ARN directly into the compiled Task state,
// bypassing this function entirely for that node type. This file only ever
// runs for node types that leave executorArn unset, which is every built-in
// type as of writing, but won't necessarily stay that way.
//
// errorAggregator collects from two sources: $.checkResults (top-level checks,
// each keyed by nodeId so siblings don't overwrite each other - see
// compiler.ts's resultKey logic) and $.iterationResults (checks inside a
// repeatForEach, collected per-item by the Map state itself).

import { resolveHttpRequest, HttpActionConfig } from '../flowBuilderShared/httpActionResolver';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const SUMMARY_TABLE = process.env.EXECUTION_SUMMARY_TABLE_NAME;
const DETAIL_BUCKET = process.env.EXECUTION_DETAIL_BUCKET_NAME;

interface ExecutorEvent {
  nodeId: string;
  nodeType: string;
  config?: Record<string, unknown>;
  item?: Record<string, unknown>;
  executionId?: string;
}

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path
    .split(/[.[\]]/)
    .filter(Boolean)
    .reduce<unknown>((acc, key) => {
      if (acc == null) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
}

function interpolate(template: string, item: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = getPath(item, path);
    return value == null ? '' : String(value);
  });
}

function runCheck(config: Record<string, unknown>, item: Record<string, unknown>) {
  const value = getPath(item, config.fieldPath as string);
  // Field-vs-field comparison (Kazilo's condition-node style) - if
  // compareValue looks like one of this system's real path conventions
  // (always starts with payload. or actionResults., never coincidentally,
  // since that's enforced everywhere else), resolve it the same way
  // fieldPath is resolved. Otherwise it's a genuine literal, used as-is -
  // exactly the prior behavior, so this is additive, not a breaking change
  // for every check already built before this existed.
  const rawCompareValue = config.compareValue;
  const looksLikeFieldPath =
    typeof rawCompareValue === 'string' &&
    (rawCompareValue.startsWith('payload.') || rawCompareValue.startsWith('actionResults.'));
  const compareValue = looksLikeFieldPath ? getPath(item, rawCompareValue as string) : rawCompareValue;
  let passed: boolean;

  switch (config.rule) {
    case 'mustExist':
      passed = value !== undefined && value !== null;
      break;
    case 'nonEmpty':
      passed = value !== undefined && value !== null && String(value).trim() !== '';
      break;
    case 'greaterThan':
      passed = Number(value) > Number(compareValue);
      break;
    case 'lessThan':
      passed = Number(value) < Number(compareValue);
      break;
    case 'matchesRegex':
      passed = typeof value === 'string' && new RegExp(String(compareValue)).test(value);
      break;
    default:
      passed = true;
  }

  return {
    passed,
    violation: passed
      ? undefined
      : { fieldPath: config.fieldPath, rule: config.rule, expected: compareValue, actual: value },
  };
}

async function runAction(nodeType: string, config: Record<string, unknown>, item: Record<string, unknown>) {
  switch (nodeType) {
    case 'emailAlert':
      console.log('emailAlert (stub):', {
        to: config.recipients,
        subject: interpolate(String(config.subject ?? ''), item),
        body: interpolate(String(config.body ?? ''), item),
      });
      return { acknowledged: true };
    case 'slackAlert':
      console.log('slackAlert (stub):', {
        channel: config.channel,
        message: interpolate(String(config.message ?? ''), item),
      });
      return { acknowledged: true };
    case 'httpCall': {
      // Real request now, not a bare fetch(url) with no headers/body/auth -
      // built via the SAME resolver the "send test request" button uses, so
      // testing a request and actually sending it can never diverge.
      const request = await resolveHttpRequest(config as HttpActionConfig, item);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        const bodyText = await response.text();
        // Captured into $.actionResults.<nodeId> by the compiler's
        // ResultPath - this return value IS what a later node's field picker
        // path like "actionResults.httpCall_123.body.someField" resolves
        // against. Attempting JSON.parse so a later check can reference a
        // nested field directly, not just the raw response text.
        let parsedBody: unknown = bodyText;
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          // Not JSON - leave as raw text, still usable, just not nestable.
        }
        return { status: response.status, ok: response.ok, body: parsedBody };
      } catch (err) {
        // Still fire-and-forget in the sense that a failed call doesn't stop
        // the flow (no error thrown), but now the failure itself is visible
        // to a later node via actionResults, not silently swallowed.
        console.error('httpCall action failed:', err);
        return { status: 0, ok: false, error: (err as Error).message };
      }
    }
    case 'lambdaInvoke':
      console.log('lambdaInvoke (stub):', { functionArn: config.functionArn });
      return { acknowledged: true };
    default:
      console.log(`Unrecognized action node type ${nodeType} - no-op.`);
      return { acknowledged: true };
  }
}

export const handler = async (event: ExecutorEvent) => {
  const item = event.item ?? {};
  const config = event.config ?? {};

  switch (event.nodeType) {
    case 'fieldValidator':
      return runCheck(config, item);

    case 'computedCheck': {
      const [a, op, b] = String(config.expression ?? '').split(/\s+/);
      const left = Number(getPath(item, a));
      const right = Number(getPath(item, b));
      const computed = op === '*' ? left * right : op === '+' ? left + right : left;
      const comparedTo = Number(getPath(item, config.comparedTo as string));
      const passed = computed === comparedTo;
      return {
        passed,
        violation: passed ? undefined : { expression: config.expression, computed, expected: comparedTo },
      };
    }

    case 'errorAggregator': {
      const state = item as {
        documentType?: string;
        payload?: unknown;
        iterationResults?: Array<{ violation?: unknown }>;
        checkResults?: Record<string, { violation?: unknown }>;
      };
      const fromIteration = (state.iterationResults ?? []).map((r) => r.violation).filter(Boolean);
      const fromTopLevel = Object.values(state.checkResults ?? {})
        .map((r) => r.violation)
        .filter(Boolean);
      const violations = [...fromTopLevel, ...fromIteration];
      const result = { violations, status: violations.length > 0 ? 'failed' : ('passed' as const) };

      // Persisted regardless of pass/fail - a summary row + the full detail
      // blob, the exact pattern the original validator already proved out
      // (cheap listable summary in DynamoDB, full payload/violations lazily
      // fetched from S3 only when someone opens one specific execution).
      // Best-effort: a write failure here shouldn't fail the actual
      // validation result the caller is waiting on.
      if (SUMMARY_TABLE && DETAIL_BUCKET && event.executionId) {
        const evaluatedAt = new Date().toISOString();
        const s3Key = `${state.documentType ?? 'unknown'}/${event.executionId}.json`;
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: DETAIL_BUCKET,
              Key: s3Key,
              Body: JSON.stringify({ payload: state.payload, checkResults: state.checkResults, violations }),
              ContentType: 'application/json',
            }),
          );
          await ddb.send(
            new PutCommand({
              TableName: SUMMARY_TABLE,
              Item: {
                documentType: state.documentType ?? 'unknown',
                evaluatedAt,
                executionId: event.executionId,
                status: result.status,
                violationCount: violations.length,
                s3Key,
              },
            }),
          );
        } catch (err) {
          console.error('Failed to persist execution history (validation result itself is unaffected):', err);
        }
      }

      return result;
    }

    case 'emailAlert':
    case 'slackAlert':
    case 'httpCall':
    case 'lambdaInvoke':
      return runAction(event.nodeType, config, item);

    default:
      throw new Error(`flowExecutor: unhandled node type ${event.nodeType}`);
  }
};
