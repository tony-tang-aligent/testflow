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

interface ExecutorEvent {
  nodeId: string;
  nodeType: string;
  config?: Record<string, unknown>;
  item?: Record<string, unknown>;
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
  const compareValue = config.compareValue;
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
      return;
    case 'slackAlert':
      console.log('slackAlert (stub):', {
        channel: config.channel,
        message: interpolate(String(config.message ?? ''), item),
      });
      return;
    case 'httpCall': {
      // Real request now, not a bare fetch(url) with no headers/body/auth -
      // built via the SAME resolver the "send test request" button uses, so
      // testing a request and actually sending it can never diverge.
      const request = await resolveHttpRequest(config as HttpActionConfig, item);
      await fetch(request.url, { method: request.method, headers: request.headers, body: request.body }).catch(
          (err) => console.error('httpCall action failed (fire-and-forget, not retried):', err),
      );
      return;
    }
    case 'lambdaInvoke':
      console.log('lambdaInvoke (stub):', { functionArn: config.functionArn });
      return;
    default:
      console.log(`Unrecognized action node type ${nodeType} - no-op.`);
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
        iterationResults?: Array<{ violation?: unknown }>;
        checkResults?: Record<string, { violation?: unknown }>;
      };
      const fromIteration = (state.iterationResults ?? []).map((r) => r.violation).filter(Boolean);
      const fromTopLevel = Object.values(state.checkResults ?? {})
          .map((r) => r.violation)
          .filter(Boolean);
      const violations = [...fromTopLevel, ...fromIteration];
      return { violations, status: violations.length > 0 ? 'failed' : 'passed' };
    }

    case 'emailAlert':
    case 'slackAlert':
    case 'httpCall':
    case 'lambdaInvoke':
      await runAction(event.nodeType, config, item);
      return { acknowledged: true };

    default:
      throw new Error(`flowExecutor: unhandled node type ${event.nodeType}`);
  }
};