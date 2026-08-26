// infra/lambda/aggregate/index.ts
//
// Final state per round. Merges violations across all scopes, derives overall
// status, writes the DynamoDB summary (hot/queryable) and the S3 detail object
// (cold/full audit). Runs once per correction round when the human-review loop
// is active (see CDK stack) - each round's result determines whether the Choice
// state after this loops back for another round or finishes.

import { putExecutionSummary } from '../shared/ddb';
import { putExecutionDetail } from '../shared/s3';
import { ExecutionInput, ValidationResult, Violation, DismissedWarning } from '../shared/types';
import { EvaluateRulesOutput } from '../evaluateRules';

export interface AggregateInput {
  input: ExecutionInput;
  // One array per scope (each scope may have multiple item batches, per
  // ItemBatcher) - not a flat list. See the CDK stack's outputPath comment on
  // innerDistributedMap for why this is nested one level deeper than before.
  scopeResults: EvaluateRulesOutput[][];
  // Accumulated across every round so far - a warning dismissed in round 1
  // stays dismissed in round 3, even though the rule re-fires identically
  // every round until the underlying data actually changes.
  dismissedWarnings?: DismissedWarning[];
}

function deriveStatus(violations: Violation[]): ValidationResult['status'] {
  if (violations.some((v) => v.severity === 'block')) return 'failed';
  if (violations.some((v) => v.severity === 'warn' && !v.dismissed)) return 'warned';
  return 'passed';
}

function markDismissed(violations: Violation[], dismissedWarnings: DismissedWarning[]): Violation[] {
  return violations.map((v) => {
    if (v.severity !== 'warn') return v; // dismissal never applies to blocking violations
    const isDismissed = dismissedWarnings.some((d) => d.ruleId === v.ruleId && d.itemId === v.itemId);
    return isDismissed ? { ...v, dismissed: true } : v;
  });
}

export const handler = async (agInput: AggregateInput): Promise<ValidationResult> => {
  const { input, scopeResults, dismissedWarnings = [] } = agInput;

  const flatResults = scopeResults.flat();
  const rawViolations = flatResults.flatMap((r) => r.violations);
  const rulesEvaluated = flatResults.flatMap((r) => r.rulesEvaluated);
  const violations = markDismissed(rawViolations, dismissedWarnings);

  const result: ValidationResult = {
    tenantId: input.tenantId,
    flowId: input.flowId,
    orderId: input.orderId,
    executionId: input.executionId,
    status: deriveStatus(violations),
    rulesEvaluated,
    violations,
    evaluatedAt: new Date().toISOString(),
    payload: input.payload,
  };

  const s3Key = await putExecutionDetail(result);

  await putExecutionSummary({
    tenantId: input.tenantId,
    flowId: input.flowId,
    executionId: input.executionId,
    orderId: input.orderId,
    status: result.status,
    violationCount: violations.filter((v) => !v.dismissed).length,
    evaluatedAt: result.evaluatedAt,
    s3Key,
  });

  return result;
};
