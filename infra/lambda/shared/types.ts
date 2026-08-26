// infra/lambda/shared/types.ts
//
// Core domain model for the validation engine. Mirrors the design discussed:
// - Resolver: how to fetch a value (payload path, reference lookup, or historical query)
// - Evaluate: how to compare two resolved values
// - Rule: resolve + evaluate + gating (appliesWhen) + severity
// - Scope: a named iteration target (order, lineItem, shipment, ...) mapped to a JSONPath
// - FlowDefinition: which scopes + rules apply for a tenant, and which ERP adapter to use
// - ValidationResult: the output shape (DynamoDB summary + S3 detail combined here;
//   the aggregate Lambda splits this into the two persisted representations)

export type ResolverSource = 'payload' | 'reference' | 'historical' | 'internal' | 'httpCall' | 'ai' | 'computed';

export interface Resolver {
  source: ResolverSource;
  // 'payload' source: plain dot-path into the current scope item (or root payload for order scope)
  path?: string;
  // 'reference' source: fetch a related document/line via the ERP adapter, then read `path` off it
  refType?: string; // e.g. 'purchaseOrder' | 'goodsReceipt' | 'vendorMaster' | 'customerMaster' | 'materialMaster'
  refKey?: string; // dot-path in the current scope item that identifies the reference (e.g. 'poNumber')
  refLineKey?: string; // optional: dot-path identifying a specific line within the reference (e.g. 'sku')
  // 'historical' source: has anything matching these keys been seen before (uniqueness checks)
  entity?: string; // e.g. 'invoice' | 'order'
  keyFields?: string[]; // dot-paths in the current scope item, e.g. ['vendorId', 'invoiceNumber']

  // 'internal' source: a lookup against data WE own (not an external system) - e.g. a running
  // total, a cache, a reference table the flow system itself maintains. Always the same
  // DynamoDB table regardless of which ERP adapter the flow is configured with.
  internalTable?: string; // logical namespace, e.g. 'customerCreditLimits'
  internalKey?: string; // dot-path in the current scope item identifying the record, e.g. 'customerId'
  // `path` (above) is reused here too: dot-path into the stored record to read the actual value.

  // 'httpCall' source: the deliberate escape hatch for a system that doesn't have (and may
  // never get) a dedicated adapter. Fully self-contained per resolver - no shared per-flow
  // adapter involved, unlike 'reference'. Curated systems should still get a real ErpAdapter;
  // this exists for the long tail, same role as n8n's "HTTP Request" node or Zapier's
  // "Webhooks by Zapier" next to their proper app integrations.
  httpMethod?: 'GET' | 'POST' | 'PUT';
  httpUrl?: string; // supports {{field}} interpolation from the current scope item
  httpHeaders?: Record<string, string>;
  httpAuthSecretName?: string; // Secrets Manager secret name holding a bearer token/API key
  httpBodyTemplate?: string; // JSON string template, {{field}} interpolation, for POST/PUT
  httpResponsePath?: string; // dot-path into the JSON response to extract the value

  // 'ai' source: BYOK - uses the tenant's own AI provider API key, never the platform's.
  // See aiAdapterRegistry.ts for credential resolution.
  aiPrompt?: string; // template with {{field}} interpolation from the current scope item
  aiResponsePath?: string; // optional - if the prompt asks for JSON, extract this path; else raw text

  // 'computed' source - arithmetic entirely within our own data, no external
  // call at all. Two shapes: combine two other resolved values (e.g.
  // quantity * unitPrice), or sum one field across an array (e.g.
  // sum(lineItems[].lineTotal) - naturally works at the order scope, since an
  // order-scoped rule's "current item" is the whole payload and can freely
  // reach into lineItems as a full array).
  computeOperator?: 'multiply' | 'add' | 'subtract' | 'divide' | 'sumField';
  computeOperands?: Resolver[]; // exactly 2, for multiply/add/subtract/divide
  sumFieldArrayPath?: string; // for sumField - dot-path to an array, relative to the current item
  sumFieldName?: string; // for sumField - which field to sum across that array
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
  tolerance?: number; // used by withinTolerancePct / withinToleranceAbs
}

export type Severity = 'block' | 'warn';

export interface Rule {
  tenantId: string;
  flowId: string; // scopes this rule to one flow - a tenant's rules are no longer one flat pool
  ruleId: string;
  version: number;
  active: boolean;
  scopeId: string; // which scope this rule runs under, e.g. 'order' | 'lineItem' | 'shipment'
  kind: 'validation' | 'derivation';
  // For derivation rules: writes `writesTo` into the scope-local context instead of producing a violation.
  writesTo?: string;
  resolve?: Resolver; // derivation rules use this to compute the derived value
  evaluate?: Evaluate; // validation rules use this
  // Gate: JSON Logic evaluated against the scope-local context (built from prior derivation rules).
  // If it evaluates falsy, the rule is skipped entirely for this item.
  appliesWhen?: Record<string, unknown>;
  severity?: Severity; // required for validation rules
  message?: string; // human-readable violation message template
}

export interface ScopeDefinition {
  scopeId: string;
  // JSONPath-ish dot path into the order payload identifying the array (or single object) to iterate.
  // Root scope ("order") uses '$' to mean "the whole payload, single item".
  itemsPath: string;
}

export interface FlowDefinition {
  tenantId: string;
  flowId: string; // one tenant can have multiple flows (e.g. "AP invoice validation", "PO order validation")
  name: string;
  version: number;
  adapterId: string; // which ERPAdapter implementation to load, e.g. 'myob-advanced' | 'mock'
  scopes: ScopeDefinition[];
  executionMode: 'failFast' | 'collectAll';
  // A real example order payload, pasted once via the builder UI, that the frontend's
  // field picker browses. Not read by the execution engine itself - purely an
  // authoring aid, persisted here since FlowDefinition is already the per-flow config document.
  samplePayload?: Record<string, unknown>;
}

export interface Violation {
  ruleId: string;
  ruleVersion: number;
  severity: Severity;
  scopeId: string;
  itemId?: string; // present when scopeId != 'order' (e.g. line item id / sku)
  message: string;
  expected: unknown;
  actual: unknown;
  details?: Record<string, unknown>;
  // Set when a reviewer explicitly dismissed this specific warning during a
  // correction round. Never true for 'block' severity - a blocking violation
  // can only go away by actually being fixed and re-validated, never dismissed.
  dismissed?: boolean;
  // The dot-path (within the current scope item, or from payload root for the
  // 'order' scope) that the LEFT side of the comparison actually read - only
  // set when that side came from our own payload (source: 'payload'). A
  // reference/historical/internal/ai-sourced value isn't something we'd write
  // back into the payload, so those violations have no correctablePath and
  // fall back to the whole-JSON editor instead of a per-field input.
  correctablePath?: string;
}

export interface ValidationResult {
  tenantId: string;
  flowId: string;
  orderId: string;
  executionId: string;
  // Widened to ExecutionStatus (not just what deriveStatus itself ever
  // returns) because awaitCorrection patches this field to 'needs_review'
  // after the fact, on the same stored object - keeping the S3 detail and the
  // DynamoDB summary showing the same status rather than silently diverging.
  status: ExecutionStatus;
  rulesEvaluated: Array<{ ruleId: string; version: number }>;
  violations: Violation[];
  evaluatedAt: string;
  // The payload this round actually validated against - needed so a reviewer
  // has something to look at/edit when a correction is required. Without this,
  // ExecutionDetail had violations but nothing showing what data produced them.
  payload: Record<string, unknown>;
}

// The stored ExecutionSummary can be in one more state than a single Aggregate
// run ever produces on its own: 'needs_review' is layered on by the state
// machine's Choice/AwaitCorrection loop, not something deriveStatus decides -
// it means "this round found blocking violations and is now paused, waiting
// for a human to correct the payload," as opposed to 'failed', which (in this
// system) never actually gets stored as a final state - failed rounds always
// route to needs_review instead. See CDK stack + awaitCorrection Lambda.
export type ExecutionStatus = 'passed' | 'warned' | 'failed' | 'needs_review';

export interface DismissedWarning {
  ruleId: string;
  itemId?: string;
}

// Input contract for the state machine. Deliberately loose per "don't worry about input/output shape yet" —
// this is the minimum needed to drive execution; extend as the real trigger contract solidifies.
export interface ExecutionInput {
  tenantId: string;
  flowId: string;
  executionId: string;
  orderId: string;
  payload: Record<string, unknown>;
}
