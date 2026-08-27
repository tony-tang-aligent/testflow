// packages/flow-compiler/src/types.ts
//
// The canvas graph's own shape - deliberately NOT the old validator engine's
// Rule/FlowDefinition types. See flow-compiler-spec.md §2-3: this is a
// general node graph (start -> nodes -> end), not a scopes-and-rules list.

export type NodeCategory = 'control' | 'check' | 'transform' | 'action' | 'aggregation' | 'output';

/** A node's TYPE (e.g. 'fieldValidator') is looked up in the NodeTypeRegistry
 * at compile time to get its executor + config schema. This is the fourth
 * instance of the registry pattern already proven (ERP adapters, AI adapter,
 * generic HTTP resolver) - see spec §3. */
export interface FlowNode {
  id: string;
  type: string; // key into NodeTypeRegistry
  position: { x: number; y: number };
  config: Record<string, unknown>; // shape defined by the node type's configSchema
  label?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: 'true' | 'false' | 'default'; // which branch of a Choice node this edge represents
  target: string;
}

export interface FlowGraph {
  flowId: string;
  documentType: string; // 'Order' | 'Invoice' | ... - what this flow validates
  nodes: FlowNode[];
  edges: FlowEdge[];
  // Drives the field picker (§3 of the UX pass) - without a sample payload,
  // there's nothing to pick a field FROM, so config fields fall back to plain
  // text entry. Optional deliberately - a flow can exist before anyone's set one.
  samplePayload?: Record<string, unknown>;
}

/** A registered node type - drives both the canvas's palette/config-form
 * rendering and the compiler's ASL generation for that node. */
export interface NodeTypeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  // Whether this node type can have an outgoing edge at all - false for every
  // action node, per spec §4 ("structurally forbidden from having any
  // outgoing edge"). Enforced by both the canvas UI and the validator.
  canHaveOutput: boolean;
  // Whether this node type produces a true/false branch (a Choice node) or
  // just a single default next-step - per spec §5.
  branches: boolean;
  configFields: ConfigField[];
  // Points a compiled Task state at a SPECIFIC Lambda instead of the shared
  // default executor (infra/lambda/flowExecutor) - this is the actual
  // mechanism behind spec §8's "trusted partner brings their own Lambda,"
  // not just documented intent. Unset for every built-in type here (they all
  // share the default executor's internal switch/case); a partner's
  // marketplace node sets this to their own function's real ARN, known at
  // registry-definition time - the compiler embeds it directly rather than
  // going through the placeholder-substitution path the default executor
  // needs (see compiler.ts's resourceArnFor).
  executorArn?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  // 'fieldPicker' reuses the same tree-browsing pattern already proven in the
  // original validator (lib/fieldTree.ts) - browse the flow's sample payload
  // instead of typing a raw dot-path by hand. Used for fieldPath/comparedTo/
  // arrayPath specifically; plain 'text' stays for things like URLs, emails,
  // messages that were never meant to reference a payload field at all.
  // 'keyValueMapper' is a dynamic add/remove list of {key, value} rows, each
  // value supporting {{payload.x}} interpolation - the actual data-mapper
  // piece for the HTTP action node (see nodeRegistry.ts's httpCall entry).
  kind: 'text' | 'textarea' | 'select' | 'checkboxGroup' | 'fieldPicker' | 'keyValueMapper';
  placeholder?: string;
  options?: string[]; // for 'select' and 'checkboxGroup'
}

export interface KeyValueRow {
  id: string;
  key: string;
  // A plain string that may contain {{payload.x}} placeholders, resolved via
  // the same interpolate() function already used by emailAlert/slackAlert -
  // one shared resolution mechanism, not a second parallel one for this node.
  value: string;
}