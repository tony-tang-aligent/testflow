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
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESClient({});
const SUMMARY_TABLE = process.env.EXECUTION_SUMMARY_TABLE_NAME;
const DETAIL_BUCKET = process.env.EXECUTION_DETAIL_BUCKET_NAME;
// Must be a verified identity (email address or domain) in SES, in the SAME
// region this Lambda runs in - SES verification is per-region. If the SES
// account is still in sandbox mode (the default for new accounts), every
// recipient also needs to be individually verified until production access
// is requested - not something this code can detect or work around, a real
// account-level setting to check separately.
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS;

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
    case 'emailAlert': {
      if (!SES_FROM_ADDRESS) throw new Error('SES_FROM_ADDRESS is not configured');
      const subject = interpolate(String(config.subject ?? ''), item);
      const body = interpolate(String(config.body ?? ''), item);
      // Plain-text recipients field, comma-separated - not a real list-
      // builder UI, so this needs to split/trim itself rather than assume
      // one address.
      const toAddresses = String(config.recipients ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (toAddresses.length === 0) throw new Error('emailAlert has no recipients configured');

      // Deliberately no try/catch swallowing this - a failed send should
      // fail this Step Functions task, not silently report
      // {acknowledged: true} the way the stub always did regardless of
      // whether anything actually went out. This node is terminal
      // specifically to notify someone; a notification that silently never
      // sent is worse than a visibly failed execution.
      await ses.send(
          new SendEmailCommand({
            Source: SES_FROM_ADDRESS,
            Destination: { ToAddresses: toAddresses },
            Message: {
              Subject: { Data: subject },
              Body: { Text: { Data: body } },
            },
          }),
      );
      return { acknowledged: true, to: toAddresses };
    }
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
        flowId?: string;
        payload?: unknown;
        // Each iteration's result is the WHOLE item merged with checkResult
        // (ResultPath: '$.checkResult' merges into the item, it doesn't
        // replace it) - not a bare {violation} object. Reading r.violation
        // directly here was the actual bug: that path never had anything,
        // so every loop's violations were silently dropped regardless of
        // how many items really failed.
        iterationResults?: Array<{ checkResult?: { violation?: unknown } }>;
        checkResults?: Record<string, { violation?: unknown }>;
      };
      const fromIteration = (state.iterationResults ?? [])
          .map((r) => r.checkResult?.violation)
          .filter(Boolean);
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
                  // Not a key attribute - the table stays hash=documentType so
                  // the aggregated /logs page's existing "all executions for
                  // this document type" query keeps working unchanged. This
                  // is purely what lets the PER-FLOW history page filter down
                  // to just this flow's own runs, via flowExecutionHistory's
                  // flowId-index GSI.
                  flowId: state.flowId,
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