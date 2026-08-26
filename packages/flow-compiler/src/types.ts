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
}

export interface ConfigField {
  key: string;
  label: string;
  // 'fieldPicker' reuses the same tree-browsing pattern already proven in the
  // original validator (lib/fieldTree.ts) - browse the flow's sample payload
  // instead of typing a raw dot-path by hand. Used for fieldPath/comparedTo/
  // arrayPath specifically; plain 'text' stays for things like URLs, emails,
  // messages that were never meant to reference a payload field at all.
  kind: 'text' | 'textarea' | 'select' | 'checkboxGroup' | 'fieldPicker';
  placeholder?: string;
  options?: string[]; // for 'select' and 'checkboxGroup'
}
