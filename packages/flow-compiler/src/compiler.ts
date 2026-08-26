// packages/flow-compiler/src/compiler.ts
//
// Compiles a canvas FlowGraph into Amazon States Language JSON, for exactly
// the constrained model in flow-compiler-spec.md: per-node branching only
// (no general reconvergence), one shared aggregation point, iteration as a
// nested sub-chain, action nodes as leaves. Deeply unusual graph shapes
// outside that model aren't guaranteed to compile sensibly - that's a
// deliberate scope boundary (spec §9), not an oversight.

import { FlowGraph, FlowNode } from './types';
import { getNodeType } from './nodeRegistry';
import { validateGraph, GraphViolation } from './validator';

type AslState = Record<string, unknown>;

export interface CompileResult {
  success: boolean;
  violations: GraphViolation[];
  definition?: { StartAt: string; States: Record<string, AslState> };
}

const EXECUTOR_LAMBDA_ARN_PLACEHOLDER = '${FlowNodeExecutorArn}'; // substituted by the publish Lambda at deploy time

function nodeById(graph: FlowGraph, id: string): FlowNode {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Compiler: node ${id} not found`);
  return node;
}

function outgoing(graph: FlowGraph, nodeId: string, handle?: 'true' | 'false' | 'default') {
  return graph.edges.filter((e) => e.source === nodeId && (handle ? e.sourceHandle === handle : true));
}

function nestedChainNodeIds(graph: FlowGraph, repeatNodeId: string): Set<string> {
  const inside = new Set<string>();
  const queue = outgoing(graph, repeatNodeId).map((e) => e.target);
  while (queue.length) {
    const id = queue.shift()!;
    if (inside.has(id)) continue;
    const node = nodeById(graph, id);
    if (node.type === 'errorAggregator' || node.type === 'workflowResult') continue;
    inside.add(id);
    for (const e of outgoing(graph, id)) queue.push(e.target);
  }
  return inside;
}

function compileChain(
  graph: FlowGraph,
  startNodeId: string,
  states: Record<string, AslState>,
  boundaryNodeIds?: Set<string>,
): string {
  const node = nodeById(graph, startNodeId);
  if (states[node.id]) return node.id;
  const def = getNodeType(node.type);

  if (boundaryNodeIds && !boundaryNodeIds.has(node.id) && node.type !== 'errorAggregator') {
    return node.id;
  }

  switch (node.type) {
    case 'documentInput': {
      const next = outgoing(graph, node.id)[0];
      const nextName = next ? compileChain(graph, next.target, states, boundaryNodeIds) : undefined;
      states[node.id] = { Type: 'Pass', ...(nextName ? { Next: nextName } : { End: true }) };
      return node.id;
    }

    case 'fieldValidator':
    case 'computedCheck': {
      const taskName = `${node.id}_Task`;
      const failEdge = outgoing(graph, node.id, 'false')[0];
      const continueEdge = outgoing(graph, node.id, 'true')[0] ?? outgoing(graph, node.id, 'default')[0];

      const continueName = continueEdge ? compileChain(graph, continueEdge.target, states, boundaryNodeIds) : undefined;

      // Inside an iteration's item processor, each invocation is independent
      // and the Map state itself collects one result per item into
      // $.iterationResults - $.checkResult is fine there. At the TOP level,
      // multiple sibling checks would otherwise all write to the same
      // $.checkResult key and silently overwrite each other by the time
      // errorAggregator runs - keying by nodeId instead ($.checkResults.<id>)
      // is what actually lets errorAggregator see every top-level check's
      // result, not just the last one to run.
      const resultKey = boundaryNodeIds ? '$.checkResult' : `$.checkResults.${node.id}`;

      states[node.id] = {
        Type: 'Task',
        Resource: EXECUTOR_LAMBDA_ARN_PLACEHOLDER,
        Parameters: { nodeId: node.id, nodeType: node.type, config: node.config, 'item.$': '$$.Execution.Input' },
        ResultPath: resultKey,
        Next: failEdge ? taskName + '_Choice' : (continueName ?? taskName),
        ...(continueName ? {} : { End: !failEdge }),
      };

      if (failEdge) {
        const failName = compileChain(graph, failEdge.target, states, boundaryNodeIds);
        states[taskName + '_Choice'] = {
          Type: 'Choice',
          Choices: [{ Variable: `${resultKey}.passed`, BooleanEquals: false, Next: failName }],
          Default: continueName ?? taskName + '_NoOp',
        };
        if (!continueName) states[taskName + '_NoOp'] = { Type: 'Pass', End: true };
      }
      return node.id;
    }

    case 'repeatForEach': {
      const nestedIds = nestedChainNodeIds(graph, node.id);
      const firstNested = outgoing(graph, node.id)[0];
      const itemProcessorStates: Record<string, AslState> = {};
      const itemStart = firstNested
        ? compileChain(graph, firstNested.target, itemProcessorStates, nestedIds)
        : undefined;

      const resumeEdge = [...nestedIds]
        .flatMap((id) => outgoing(graph, id))
        .find((e) => !nestedIds.has(e.target));
      const resumeName = resumeEdge ? compileChain(graph, resumeEdge.target, states, boundaryNodeIds) : undefined;

      states[node.id] = {
        Type: 'Map',
        ItemsPath: `$.payload.${node.config.arrayPath ?? 'items'}`,
        ItemProcessor: {
          StartAt: itemStart ?? 'NoOp',
          States: itemStart ? itemProcessorStates : { NoOp: { Type: 'Pass', End: true } },
        },
        ResultPath: '$.iterationResults',
        ...(resumeName ? { Next: resumeName } : { End: true }),
      };
      return node.id;
    }

    case 'errorAggregator': {
      const next = outgoing(graph, node.id)[0];
      const nextName = next ? compileChain(graph, next.target, states, boundaryNodeIds) : undefined;
      states[node.id] = {
        Type: 'Task',
        Resource: EXECUTOR_LAMBDA_ARN_PLACEHOLDER,
        Parameters: { nodeId: node.id, nodeType: node.type, 'item.$': '$$.Execution.Input' },
        ResultPath: '$.aggregatedResult',
        ...(nextName ? { Next: nextName } : { End: true }),
      };
      return node.id;
    }

    case 'workflowResult': {
      states[node.id] =
        node.config.returnResult === 'failed'
          ? { Type: 'Fail', Error: 'ValidationFailed', Cause: 'One or more checks failed.' }
          : { Type: 'Succeed' };
      return node.id;
    }

    default: {
      if (def.category !== 'action') throw new Error(`Compiler: unhandled node type ${node.type}`);
      states[node.id] = {
        Type: 'Task',
        Resource: EXECUTOR_LAMBDA_ARN_PLACEHOLDER,
        Parameters: { nodeId: node.id, nodeType: node.type, config: node.config, 'item.$': '$$.Execution.Input' },
        End: true,
      };
      return node.id;
    }
  }
}

export function compile(graph: FlowGraph): CompileResult {
  const violations = validateGraph(graph);
  if (violations.length > 0) return { success: false, violations };

  const startNode = graph.nodes.find((n) => n.type === 'documentInput');
  if (!startNode) {
    return {
      success: false,
      violations: [{ nodeId: '', ruleId: 'missingStart', message: 'Every flow needs a Document Input node.' }],
    };
  }

  const states: Record<string, AslState> = {};
  const startName = compileChain(graph, startNode.id, states);

  return { success: true, violations: [], definition: { StartAt: startName, States: states } };
}
