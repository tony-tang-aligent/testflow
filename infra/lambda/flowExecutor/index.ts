// infra/lambda/flowExecutor/index.ts
//
// One Lambda for every node type - the compiler wires every Task state to
// this same function, passing {nodeId, nodeType, config}. This is what makes
// adding a node type (including a trusted partner's, per spec §8) additive:
// one more case here (or, for a partner's own Lambda, a registry entry
// pointing at THEIR function instead of this one - see nodeRegistry.ts's
// executorArn field, not used by this file directly but the mechanism this
// file is one instance of).
//
// errorAggregator collects from two sources: $.checkResults (top-level checks,
// each keyed by nodeId so siblings don't overwrite each other - see
// compiler.ts's resultKey logic) and $.iterationResults (checks inside a
// repeatForEach, collected per-item by the Map state itself).

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
      const url = interpolate(String(config.url ?? ''), item);
      await fetch(url, { method: (config.method as string) ?? 'GET' }).catch((err) =>
        console.error('httpCall action failed (fire-and-forget, not retried):', err),
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
