// packages/flow-compiler/src/validator.ts
//
// Each rule is independent and same-shaped - adding a new one later is one
// function + one array entry, never a change to shared logic (spec §7).
// Every violation carries a nodeId so the canvas can highlight the exact
// offending node, all at once, per the "all violations, not one at a time"
// decision.

import { FlowGraph } from './types';
import { getNodeType } from './nodeRegistry';

export interface GraphViolation {
  nodeId: string;
  ruleId: string;
  message: string;
}

export interface GraphValidationRule {
  id: string;
  check: (graph: FlowGraph) => GraphViolation[];
}

/** Finds every node reachable inside a repeatForEach's nested sub-chain, by
 * walking forward from any node whose only path in comes from a repeatForEach
 * node, until reaching a node with no further outgoing edges within the loop
 * (an errorAggregator/workflowResult boundary ends the nested chain). This is
 * a simple reachability walk, not general graph analysis - deliberately
 * cheap, matching the constrained model (spec §5-6). */
function findNodesInsideIteration(graph: FlowGraph): Set<string> {
  const inside = new Set<string>();
  const iterationRoots = graph.nodes.filter((n) => n.type === 'repeatForEach');

  for (const root of iterationRoots) {
    const queue = graph.edges.filter((e) => e.source === root.id).map((e) => e.target);
    const visited = new Set<string>();
    while (queue.length) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      if (node.type === 'errorAggregator' || node.type === 'workflowResult') continue;
      inside.add(nodeId);
      for (const e of graph.edges.filter((e) => e.source === nodeId)) queue.push(e.target);
    }
  }
  return inside;
}

const noActionNodesInsideIteration: GraphValidationRule = {
  id: 'noActionNodesInsideIteration',
  check(graph) {
    const insideIteration = findNodesInsideIteration(graph);
    const violations: GraphViolation[] = [];
    for (const nodeId of insideIteration) {
      const node = graph.nodes.find((n) => n.id === nodeId)!;
      const def = getNodeType(node.type);
      if (def.category === 'action') {
        violations.push({
          nodeId,
          ruleId: 'noActionNodesInsideIteration',
          message: `"${def.label}" can't run inside a Repeat For Each - action nodes must run once per flow, not once per item.`,
        });
      }
    }
    return violations;
  },
};

const noDanglingEdges: GraphValidationRule = {
  id: 'noDanglingEdges',
  check(graph) {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const violations: GraphViolation[] = [];
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.source)) continue;
      if (!nodeIds.has(edge.target)) {
        violations.push({
          nodeId: edge.source,
          ruleId: 'noDanglingEdges',
          message: `This node connects to a node that no longer exists.`,
        });
      }
    }
    return violations;
  },
};

const noActionNodeOutput: GraphValidationRule = {
  id: 'noActionNodeOutput',
  check(graph) {
    const violations: GraphViolation[] = [];
    for (const node of graph.nodes) {
      const def = getNodeType(node.type);
      if (!def.canHaveOutput && graph.edges.some((e) => e.source === node.id)) {
        violations.push({
          nodeId: node.id,
          ruleId: 'noActionNodeOutput',
          message: `"${def.label}" is a terminal action - it can't have anything connected after it.`,
        });
      }
    }
    return violations;
  },
};

const noGraphCycles: GraphValidationRule = {
  id: 'noGraphCycles',
  check(graph) {
    const violations: GraphViolation[] = [];
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map(graph.nodes.map((n) => [n.id, WHITE]));

    function visit(nodeId: string): boolean {
      color.set(nodeId, GRAY);
      for (const edge of graph.edges.filter((e) => e.source === nodeId)) {
        const targetColor = color.get(edge.target);
        if (targetColor === GRAY) {
          violations.push({
            nodeId,
            ruleId: 'noGraphCycles',
            message: `This creates a loop back to an earlier node - only "Repeat For Each" can repeat, and it can't do so via a manual connection.`,
          });
          return true;
        }
        if (targetColor === WHITE && visit(edge.target)) return true;
      }
      color.set(nodeId, BLACK);
      return false;
    }

    for (const node of graph.nodes) {
      if (color.get(node.id) === WHITE) visit(node.id);
    }
    return violations;
  },
};

export const VALIDATION_RULES: GraphValidationRule[] = [
  noActionNodesInsideIteration,
  noActionNodeOutput,
  noDanglingEdges,
  noGraphCycles,
];

export function validateGraph(graph: FlowGraph): GraphViolation[] {
  return VALIDATION_RULES.flatMap((rule) => rule.check(graph));
}
