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

const EXECUTOR_LAMBDA_ARN_PLACEHOLDER = '${FlowNodeExecutorArn}'; // substituted by the publish Lambda at deploy time, for node types with no executorArn of their own

/** A registered node type's own executorArn (a partner's marketplace Lambda,
 * already a known, real ARN at registry-definition time) is embedded
 * directly - only types with none set fall back to the shared default
 * executor's placeholder, substituted later by publishFlow.ts. */
function resourceArnFor(nodeType: string): string {
  return getNodeType(nodeType).executorArn ?? EXECUTOR_LAMBDA_ARN_PLACEHOLDER;
}

function nodeById(graph: FlowGraph, id: string): FlowNode {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Compiler: node ${id} not found`);
  return node;
}

function outgoing(graph: FlowGraph, nodeId: string, handle?: 'true' | 'false' | 'default') {
  return graph.edges.filter((e) => e.source === nodeId && (handle ? e.sourceHandle === handle : true));
}

/** Same containment set the validator uses (parentId, not edge-reachability)
 * - kept as its own function here rather than imported, so the compiler
 * stays independently readable per this file's existing convention. */
function nestedChainNodeIds(graph: FlowGraph, repeatNodeId: string): Set<string> {
  return new Set(graph.nodes.filter((n) => n.parentId === repeatNodeId).map((n) => n.id));
}

/** Among a container's children, the one nothing else in the SAME container
 * points at - i.e. no sibling edge targets it. This is the actual
 * simplification the container redesign enables: repeatForEach no longer
 * needs an outgoing edge of its own at all. Previously its single outgoing
 * edge was what identified the first nested node; now that membership is
 * spatial (parentId) rather than edge-based, the entry point is just
 * whichever child has no incoming edge FROM ANOTHER CHILD - derived, not
 * drawn. */
function findEntryChild(graph: FlowGraph, childIds: Set<string>): string | undefined {
  const targetedBySibling = new Set(
      graph.edges.filter((e) => childIds.has(e.source) && childIds.has(e.target)).map((e) => e.target),
  );
  return [...childIds].find((id) => !targetedBySibling.has(id));
}

/** Resolves what a node's Next should actually be, given an edge target -
 * NOT the same as just calling compileChain and using its return value,
 * which always returns the node's id even when the boundary check stops it
 * from actually compiling. Without this, a check node inside a loop whose
 * "continue" edge points at errorAggregator (outside the loop) would end up
 * with a literal "Next": "errorAggregator_..." inside the Map's
 * ItemProcessor.States - but errorAggregator was never actually compiled
 * there, so that's a dangling reference to a state that doesn't exist in
 * that scope. Step Functions requires every Next within a given
 * States object to resolve to a state defined in that SAME object - the
 * real transition out of a loop happens at the Map state's own level (via
 * repeatForEach's resumeEdge/resumeName), never from within an individual
 * item's own chain. If the target is out of bounds, this chain simply ends
 * here (End: true) instead of pointing at something that isn't there. */
function resolveNext(
    graph: FlowGraph,
    targetId: string | undefined,
    states: Record<string, AslState>,
    boundaryNodeIds?: Set<string>,
): string | undefined {
  if (!targetId) return undefined;
  if (boundaryNodeIds && !boundaryNodeIds.has(targetId)) return undefined;
  return compileChain(graph, targetId, states, boundaryNodeIds);
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

  if (boundaryNodeIds && !boundaryNodeIds.has(node.id)) {
    // No longer excepts errorAggregator - that exception was the actual bug.
    // A check node INSIDE a loop resolving its own "continue" edge to
    // errorAggregator (outside the loop) would hit this same boundary check,
    // and the exception let it slip through anyway - compiling errorAggregator
    // (and whatever's downstream of it, like workflowResult) DIRECTLY INTO
    // the loop's inner ItemProcessor.States, instead of stopping here and
    // letting repeatForEach's own separate resumeEdge logic compile it once,
    // correctly, into the OUTER state machine. Both ended up compiled TWICE -
    // a malformed/duplicated ASL definition that AWS's CreateStateMachine
    // call rejects, which (with no try/catch around that call) is exactly
    // what turned into an uncaught exception and a 500. The exception was
    // meant to let repeatForEach's OWN resumeEdge call reach errorAggregator
    // even when repeatForEach itself is nested - but that call always passes
    // boundaryNodeIds from repeatForEach's OWN nesting level, which is
    // undefined for every loop this project actually supports (nested loops
    // are out of scope), so this check never even applies there. The
    // exception was never needed for the case it was protecting.
    return node.id;
  }

  switch (node.type) {
    case 'documentInput': {
      const next = outgoing(graph, node.id)[0];
      const nextName = resolveNext(graph, next?.target, states, boundaryNodeIds);
      states[node.id] = { Type: 'Pass', ...(nextName ? { Next: nextName } : { End: true }) };
      return node.id;
    }

    case 'fieldValidator':
    case 'computedCheck': {
      const taskName = `${node.id}_Task`;
      const failEdge = outgoing(graph, node.id, 'false')[0];
      const continueEdge = outgoing(graph, node.id, 'true')[0] ?? outgoing(graph, node.id, 'default')[0];

      const continueName = resolveNext(graph, continueEdge?.target, states, boundaryNodeIds);

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
        Resource: resourceArnFor(node.type),
        // '$', not '$$.Execution.Input' - the latter is a fixed snapshot of
        // the ORIGINAL execution input, frozen for the whole run; it never
        // reflects anything an earlier node wrote via its own ResultPath.
        // Switching to '$' is safe (nothing ever mutates $.payload itself,
        // only adds new sibling keys like checkResults/actionResults) and is
        // what actually lets a check compare a field from the original
        // payload against an earlier httpCall's captured response.
        Parameters: { nodeId: node.id, nodeType: node.type, config: node.config, 'item.$': '$' },
        ResultPath: resultKey,
        // Exactly one of these three, never Next+End together (a real,
        // separate bug this fix exposed - see the comment on resolveNext).
        ...(failEdge ? { Next: taskName + '_Choice' } : continueName ? { Next: continueName } : { End: true }),
      };

      if (failEdge) {
        const failName = resolveNext(graph, failEdge.target, states, boundaryNodeIds);
        states[taskName + '_Choice'] = {
          Type: 'Choice',
          Choices: [{ Variable: `${resultKey}.passed`, BooleanEquals: false, Next: failName ?? taskName + '_FailNoOp' }],
          Default: continueName ?? taskName + '_NoOp',
        };
        // Same reasoning as the continue-path's own NoOp fallback below - a
        // Choice state's branches must each resolve to a REAL state in this
        // same States object, they can't just terminate inline the way a
        // Task's End:true can. If the fail edge's real target is outside
        // this loop (out of bounds), this item's processing just ends here
        // instead of dangling-referencing a state that isn't in this scope.
        if (!failName) states[taskName + '_FailNoOp'] = { Type: 'Pass', End: true };
        if (!continueName) states[taskName + '_NoOp'] = { Type: 'Pass', End: true };
      }
      return node.id;
    }

    case 'repeatForEach': {
      const nestedIds = nestedChainNodeIds(graph, node.id);
      // No outgoing edge of its own needed anymore - the entry point is
      // derived from container membership, not drawn as a connection from
      // the repeatForEach node itself. See findEntryChild's comment for why.
      const entryChildId = findEntryChild(graph, nestedIds);
      const itemProcessorStates: Record<string, AslState> = {};
      const itemStart = entryChildId
          ? compileChain(graph, entryChildId, itemProcessorStates, nestedIds)
          : undefined;

      const resumeEdge = [...nestedIds]
          .flatMap((id) => outgoing(graph, id))
          .find((e) => !nestedIds.has(e.target));
      const resumeName = resumeEdge ? compileChain(graph, resumeEdge.target, states, boundaryNodeIds) : undefined;

      states[node.id] = {
        Type: 'Map',
        // Full path, not auto-prefixed with "payload." anymore - this now
        // matches fieldPath/comparedTo's own convention exactly (the field
        // picker always generates a full path from the wrapped execution
        // root, e.g. "payload.lineItems"), rather than requiring arrayPath to
        // be a bare name while those two fields need the full path. Two
        // different implicit conventions for what looked like the same
        // picker control - this was a real inconsistency, not a style choice.
        ItemsPath: `$.${node.config.arrayPath ?? 'payload.items'}`,
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
      const nextName = resolveNext(graph, next?.target, states, boundaryNodeIds);
      states[node.id] = {
        Type: 'Task',
        Resource: resourceArnFor(node.type),
        // '$', not '$$.Execution.Input' - this was the actual bug behind
        // aggregatedResult always coming back empty regardless of real
        // violations. $$.Execution.Input is a FIXED snapshot of what the
        // execution started with - it never includes checkResults, since
        // that field doesn't exist until earlier Task states write it via
        // their own ResultPath, well after execution begins. errorAggregator
        // specifically needs the CURRENT state at the point it runs, not the
        // pristine original input - it's the one node whose entire job is
        // reading what everything before it just wrote.
        //
        // executionId comes from the context object ($$), a genuinely
        // different namespace than state ($) - needed so errorAggregator can
        // tag the persisted summary/detail record with something stable to
        // look it back up by later (see flowExecutionHistory's Lambda).
        Parameters: { nodeId: node.id, nodeType: node.type, 'item.$': '$', 'executionId.$': '$$.Execution.Name' },
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
      // Every action node's own return value is captured into
      // $.actionResults.<nodeId> regardless of whether anything continues
      // from it - harmless for the fire-and-forget ones (just a small
      // {acknowledged:true} marker), and what actually makes httpCall's
      // response available to a later check when it IS wired to continue
      // (only httpCall has canHaveOutput:true - see nodeRegistry.ts).
      const next = outgoing(graph, node.id)[0];
      const nextName = resolveNext(graph, next?.target, states, boundaryNodeIds);
      states[node.id] = {
        Type: 'Task',
        Resource: resourceArnFor(node.type),
        Parameters: { nodeId: node.id, nodeType: node.type, config: node.config, 'item.$': '$' },
        ResultPath: `$.actionResults.${node.id}`,
        ...(nextName ? { Next: nextName } : { End: true }),
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