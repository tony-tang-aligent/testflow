// web/lib/types.ts
// Mirrors infra/lambda/shared/types.ts - kept as a separate copy since the FE
// package doesn't share a build with the infra package. Keep these in sync manually,
// or extract to a shared npm package once the monorepo structure is decided.

export type ResolverSource = 'payload' | 'reference' | 'historical' | 'internal' | 'httpCall' | 'ai' | 'computed';

export interface Resolver {
  source: ResolverSource;
  path?: string;
  refType?: string;
  refKey?: string;
  refLineKey?: string;
  entity?: string;
  keyFields?: string[];
  // 'internal' source - a lookup against data WE own, not an external system
  internalTable?: string;
  internalKey?: string;
  // 'httpCall' source - the generic escape hatch for a system without a dedicated adapter
  httpMethod?: 'GET' | 'POST' | 'PUT';
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpAuthSecretName?: string;
  httpBodyTemplate?: string;
  httpResponsePath?: string;
  // 'ai' source - BYOK, uses the tenant's own AI provider API key
  aiPrompt?: string;
  aiResponsePath?: string;
  // 'computed' source - arithmetic entirely within our own data, no external call
  computeOperator?: 'multiply' | 'add' | 'subtract' | 'divide' | 'sumField';
  computeOperands?: Resolver[];
  sumFieldArrayPath?: string;
  sumFieldName?: string;
}

export type Comparator =
  | 'equals'
  | 'notEquals'
  | 'lte'
  | 'gte'
  | 'lt'
  | 'gt'
  | 'withinTolerancePct'
  | 'withinToleranceAbs'
  | 'inSet'
  | 'exists'
  | 'notExists';

export interface Evaluate {
  comparator: Comparator;
  left: Resolver;
  right?: Resolver | { static: unknown };
  tolerance?: number;
}

export type Severity = 'block' | 'warn';

export interface Rule {
  tenantId: string;
  flowId: string;
  ruleId: string;
  version: number;
  active: boolean;
  scopeId: string;
  kind: 'validation' | 'derivation';
  writesTo?: string;
  resolve?: Resolver;
  evaluate?: Evaluate;
  appliesWhen?: Record<string, unknown>;
  severity?: Severity;
  message?: string;
}

export interface ScopeDefinition {
  scopeId: string;
  itemsPath: string;
}

export interface FlowDefinition {
  tenantId: string;
  flowId: string;
  name: string;
  version: number;
  adapterId: string;
  scopes: ScopeDefinition[];
  executionMode: 'failFast' | 'collectAll';
  // Foundation for the field picker throughout the builder - a real example order
  // payload, pasted once, that every scope/rule picker browses instead of asking
  // someone to type a raw dot-path from memory. See DEPLOYMENT.md / README for why.
  samplePayload?: Record<string, unknown>;
}

export type ExecutionStatus = 'passed' | 'warned' | 'failed' | 'needs_review';

export interface DismissedWarning {
  ruleId: string;
  itemId?: string;
}

export interface ExecutionSummary {
  tenantId: string;
  flowId: string;
  executionId: string;
  orderId: string;
  status: ExecutionStatus;
  violationCount: number;
  evaluatedAt: string;
  s3Key: string;
}

export interface Violation {
  ruleId: string;
  ruleVersion: number;
  severity: Severity;
  scopeId: string;
  itemId?: string;
  message: string;
  expected: unknown;
  actual: unknown;
  dismissed?: boolean;
  correctablePath?: string;
}

export interface ExecutionDetail {
  tenantId: string;
  flowId: string;
  orderId: string;
  executionId: string;
  status: ExecutionStatus;
  rulesEvaluated: Array<{ ruleId: string; version: number }>;
  violations: Violation[];
  evaluatedAt: string;
  payload: Record<string, unknown>;
}
