// apps/web/app/flow-builder/[flowId]/page.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Background,
  Controls,
  useReactFlow,
  useUpdateNodeInternals,
  Node,
  NodeDragHandler,
  NodeChange,
  OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlowGraph, GraphViolation } from '@workspace/flow-compiler';
import { getNodeType } from '@workspace/flow-compiler';
import { flowBuilderApi } from '../../../lib/flowBuilderApi';
import { NodePalette } from '../../../components/flow-builder/NodePalette';
import { NodeConfigPanel } from '../../../components/flow-builder/NodeConfigPanel';
import { FlowNodeCard, FlowNodeCardData } from '../../../components/flow-builder/FlowNodeCard';
import { LoopContainerNode, LoopContainerData } from '../../../components/flow-builder/LoopContainerNode';
import { DeletableEdge, DeletableEdgeData } from '../../../components/edges/DeletableEdge';
import { SidePanel } from '../../../components/SidePanel';
import { Button } from '../../../components/ui/button';

const nodeTypes = {
  flowNode: ({ data }: { data: FlowNodeCardData }) => <FlowNodeCard data={data} />,
  loopContainer: ({ data }: { data: LoopContainerData }) => <LoopContainerNode data={data} />,
};
const edgeTypes = { deletable: DeletableEdge };

const LOOP_DEFAULT_WIDTH = 420;
const LOOP_DEFAULT_HEIGHT = 280;

/** Which container (if any) a point falls inside, in absolute canvas
 * coordinates - used both when dropping a brand-new node from the palette
 * and when dragging an existing one. Only checks top-level containers
 * (nested loops aren't supported - same scope boundary as before this
 * redesign, just enforced differently now). */
function findContainerAt(
    point: { x: number; y: number },
    allNodes: Node<FlowNodeCardData | LoopContainerData>[],
): Node<LoopContainerData> | undefined {
  return allNodes.find((n): n is Node<LoopContainerData> => {
    if (n.type !== 'loopContainer') return false;
    const w = n.width ?? LOOP_DEFAULT_WIDTH;
    const h = n.height ?? LOOP_DEFAULT_HEIGHT;
    return point.x >= n.position.x && point.x <= n.position.x + w && point.y >= n.position.y && point.y <= n.position.y + h;
  });
}

function CanvasInner() {
  const params = useParams<{ flowId: string }>();
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();
  // Required whenever a node's parentNode/position relationship changes
  // AFTER its initial mount (exactly what dragging into a container does) -
  // without this, ReactFlow's own internal handle-position cache goes
  // stale, and connections to/from that node's handles can fail to
  // register correctly. This was the actual missing piece, not a CSS/
  // z-index issue - a documented ReactFlow requirement, not a guess.
  const updateNodeInternals = useUpdateNodeInternals();

  const [documentType, setDocumentType] = useState('Order');
  const [samplePayload, setSamplePayload] = useState<Record<string, unknown> | undefined>(undefined);
  const [actionSampleResponses, setActionSampleResponses] = useState<Record<string, unknown>>({});
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadDraft, setPayloadDraft] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeCardData | LoopContainerData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [violations, setViolations] = useState<GraphViolation[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const violationsByNode = new Map(violations.map((v) => [v.nodeId, v.message]));
  const selectedNode = nodes.find((n) => n.id === selectedId) as Node<FlowNodeCardData> | undefined;

  /** Plain dot-path traversal against a JS object - used only to compute the
   * per-item sample below, nothing to do with the runtime path-resolution
   * that already exists server-side in flowExecutor. */
  function getPath(obj: unknown, path: string): unknown {
    return path
        .split('.')
        .filter(Boolean)
        .reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), obj);
  }

  /** The actual fix for the loop confusion: inside a repeatForEach, Step
   * Functions' Map state makes $ the CURRENT ARRAY ITEM itself, not the
   * original payload - there's no "payload" key inside a loop at all. The
   * field picker was always showing the top-level payload tree regardless,
   * suggesting paths like "payload.lineItems.0.sku" that silently resolve to
   * nothing once actually running inside the loop. If the selected node's
   * parent is a repeatForEach, this instead shows one real sample item from
   * that array - matching what the node will genuinely see at runtime. */
  function getEffectiveSamplePayload(node: Node<FlowNodeCardData> | undefined): Record<string, unknown> | undefined {
    if (!node?.parentNode || !samplePayload) return samplePayload;
    const container = nodes.find((n) => n.id === node.parentNode);
    if (container?.type !== 'loopContainer') return samplePayload;
    const arrayPath = String(container.data.config?.arrayPath ?? '').replace(/^payload\./, '');
    const array = getPath(samplePayload, arrayPath);
    return Array.isArray(array) && array.length > 0 ? (array[0] as Record<string, unknown>) : undefined;
  }

  const decorate = useCallback(
      (n: Node<FlowNodeCardData | LoopContainerData>): Node<FlowNodeCardData | LoopContainerData> => ({
        ...n,
        // Preserve whichever type this node actually is - a real bug this
        // fixes: decorate() previously hardcoded 'flowNode' unconditionally,
        // which would have silently overwritten a loop container's type on
        // every selection/violation change.
        type: n.type,
        selected: n.id === selectedId,
        data: {
          ...n.data,
          selected: n.id === selectedId,
          hasError: violationsByNode.has(n.id),
          errorMessage: violationsByNode.get(n.id),
          // Kept live here, not baked in once at construction time - a loop
          // container's embedded field picker needs to reflect the CURRENT
          // sample payload, including edits made after this node was created,
          // not a frozen snapshot from whenever it was first added.
          samplePayload,
          onConfigChange: (patch: Record<string, unknown>) => updateNodeConfig(n.id, patch),
          onDelete: () => deleteNode(n.id),
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [selectedId, violations, samplePayload],
  );

  useEffect(() => {
    setNodes((nds) => nds.map(decorate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplePayload]);

  useEffect(() => {
    flowBuilderApi
        .getDraft(params.flowId)
        .then((graph) => {
          setDocumentType(graph.documentType);
          setSamplePayload(graph.samplePayload);
          setActionSampleResponses(graph.actionSampleResponses ?? {});

          // ReactFlow REQUIRES a parent node to appear before its children in
          // the nodes array - repeatForEach nodes sorted first covers this for
          // the one level of nesting this system supports.
          const sortedNodes = [...graph.nodes].sort((a, b) =>
              a.type === 'repeatForEach' && b.type !== 'repeatForEach' ? -1 : 0,
          );

          setNodes(
              sortedNodes.map((n) =>
                  decorate({
                    id: n.id,
                    position: n.position,
                    type: n.type === 'repeatForEach' ? 'loopContainer' : 'flowNode',
                    parentNode: n.parentId,
                    extent: n.parentId ? 'parent' : undefined,
                    style: n.type === 'repeatForEach' ? { width: n.width ?? LOOP_DEFAULT_WIDTH, height: n.height ?? LOOP_DEFAULT_HEIGHT } : undefined,
                    data: { nodeType: n.type, config: n.config, hasError: false, selected: false },
                  }),
              ),
          );
          setEdges(
              graph.edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle === 'default' ? undefined : e.sourceHandle,
                type: 'deletable',
                data: { onDelete: deleteEdge },
                style:
                    e.sourceHandle === 'false'
                        ? { stroke: '#EF4444' }
                        : e.sourceHandle === 'true'
                            ? { stroke: '#22C55E' }
                            : undefined,
              })),
          );
        })
        .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.flowId]);

  // Nodes saved in an existing draft (added before updateNodeInternals was
  // wired into onDrop/onNodeDragStop) never got their handle internals
  // registered when their parentNode was originally set - a fresh page
  // load alone doesn't retroactively fix that. Doing it once here for every
  // child, after the initial load completes, so already-saved loop contents
  // work correctly too, not just newly-added ones going forward.
  useEffect(() => {
    if (loading) return;
    nodes.filter((n) => n.parentNode).forEach((n) => updateNodeInternals(n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    setNodes((nds) => nds.map(decorate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, violations]);

  function updateNodeConfig(nodeId: string, patch: Record<string, unknown>) {
    setNodes((nds) =>
        nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
        ),
    );
  }

  function deleteNode(nodeId: string) {
    // The actual fix: a child's parentNode must ALWAYS reference a real
    // node, or ReactFlow's own internal position calculations crash
    // immediately - "orphan the children, let noDanglingParent catch it at
    // publish time" (the original design here) assumed the frontend would
    // tolerate a dangling reference long enough to reach publish. It
    // doesn't - it crashes the instant the parent leaves state, well before
    // any validation runs. Converting each child's position to absolute
    // canvas coordinates and clearing parentNode/extent keeps them as
    // normal, un-parented nodes instead - still kept, not deleted, just no
    // longer contained (matching the original intent, just implemented in
    // a way that doesn't crash ReactFlow to get there).
    const deletedNode = nodes.find((n) => n.id === nodeId);
    setNodes((nds) =>
        nds
            .filter((n) => n.id !== nodeId)
            .map((n) =>
                n.parentNode === nodeId && deletedNode
                    ? {
                      ...n,
                      position: { x: n.position.x + deletedNode.position.x, y: n.position.y + deletedNode.position.y },
                      parentNode: undefined,
                      extent: undefined,
                    }
                    : n,
            ),
    );
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
    const formerChildren = nodes.filter((n) => n.parentNode === nodeId);
    if (formerChildren.length > 0) {
      setTimeout(() => formerChildren.forEach((n) => updateNodeInternals(n.id)), 0);
    }
  }

  // The actual fix for the crash - onNodesChange fires BEFORE any separate
  // onNodesDelete callback would, and the crash happens INSIDE ReactFlow's
  // own processing of the 'remove' change itself (in createNodeInternals,
  // synchronously, as soon as a child's parentNode no longer resolves).
  // Wiring reparenting into deleteNode() alone wasn't enough - keyboard
  // delete (select + Backspace) goes through onNodesChange directly,
  // bypassing that function entirely. Intercepting every 'remove' change
  // here, regardless of what triggered it, and reparenting children BEFORE
  // letting the actual removal proceed, is what actually closes this for
  // every deletion path, not just the one this was originally tested against.
  const handleNodesChange: OnNodesChange = (changes) => {
    const removedContainerIds = changes
        .filter((c): c is Extract<NodeChange, { type: 'remove' }> => c.type === 'remove')
        .map((c) => c.id)
        .filter((id) => nodes.find((n) => n.id === id)?.type === 'loopContainer');

    if (removedContainerIds.length > 0) {
      setNodes((nds) =>
          nds.map((n) => {
            if (!n.parentNode || !removedContainerIds.includes(n.parentNode)) return n;
            const container = nds.find((c) => c.id === n.parentNode)!;
            return {
              ...n,
              position: { x: n.position.x + container.position.x, y: n.position.y + container.position.y },
              parentNode: undefined,
              extent: undefined,
            };
          }),
      );
    }
    onNodesChange(changes);
  };

  function deleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }

  async function handleCaptureActionResponse(nodeId: string, body: unknown) {
    const updated = { ...actionSampleResponses, [nodeId]: body };
    setActionSampleResponses(updated);
    await flowBuilderApi.saveDraft(params.flowId, { ...toGraph(), actionSampleResponses: updated });
  }

  function onConnect(connection: Connection) {
    const style =
        connection.sourceHandle === 'false'
            ? { stroke: '#EF4444' }
            : connection.sourceHandle === 'true'
                ? { stroke: '#22C55E' }
                : undefined;
    setEdges((eds) => addEdge({ ...connection, type: 'deletable', data: { onDelete: deleteEdge }, style }, eds));
  }

  /** Whichever existing child of a container doesn't already point at
   * another sibling - i.e. the current end of that container's chain. Used
   * to auto-wire a newly added/moved node onto the end, instead of leaving
   * it disconnected and requiring a manual edge every time - dragging a node
   * INTO the visual container should be enough on its own. */
  function findChainTailInContainer(containerId: string, excludeId?: string): string | undefined {
    const childIds = new Set(nodes.filter((n) => n.parentNode === containerId && n.id !== excludeId).map((n) => n.id));
    if (childIds.size === 0) return undefined;
    const pointsAtSibling = new Set(
        edges.filter((e) => childIds.has(e.source) && childIds.has(e.target)).map((e) => e.source),
    );
    return [...childIds].find((id) => !pointsAtSibling.has(id));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/flow-node-type');
    if (!nodeType) return;
    const absolutePosition = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `${nodeType}_${Date.now()}`;

    if (nodeType === 'repeatForEach') {
      // Containers can't nest inside each other - same scope boundary as
      // before, just no longer possible to even attempt by accident, since
      // this branch never checks for or sets a parent.
      setNodes((nds) => [
        ...nds,
        decorate({
          id,
          position: absolutePosition,
          type: 'loopContainer',
          style: { width: LOOP_DEFAULT_WIDTH, height: LOOP_DEFAULT_HEIGHT },
          data: { nodeType, config: {}, hasError: false, selected: false },
        }),
      ]);
      return;
    }

    const container = findContainerAt(absolutePosition, nodes);
    const position = container
        ? { x: absolutePosition.x - container.position.x, y: absolutePosition.y - container.position.y }
        : absolutePosition;

    setNodes((nds) => [
      ...nds,
      decorate({
        id,
        position,
        type: 'flowNode',
        parentNode: container?.id,
        extent: container ? 'parent' : undefined,
        data: { nodeType, config: {}, hasError: false, selected: false },
      }),
    ]);
    if (container) setTimeout(() => updateNodeInternals(id), 0);

    if (container) {
      const tailId = findChainTailInContainer(container.id);
      if (tailId) {
        setEdges((eds) => [
          ...eds,
          { id: `${tailId}-${id}`, source: tailId, target: id, type: 'deletable', data: { onDelete: deleteEdge } },
        ]);
      }
    }
  }

  // Dragging an EXISTING node in or out of a container - onDrop above only
  // covers brand-new nodes from the palette. This is the other half: moving
  // something already on the canvas across a container's boundary.
  const onNodeDragStop: NodeDragHandler = (_, draggedNode) => {
    if (draggedNode.type === 'loopContainer') return; // containers themselves never get parented

    const currentParent = nodes.find((n) => n.id === draggedNode.parentNode);
    const absolutePosition = currentParent
        ? { x: draggedNode.position.x + currentParent.position.x, y: draggedNode.position.y + currentParent.position.y }
        : draggedNode.position;

    const newContainer = findContainerAt(absolutePosition, nodes.filter((n) => n.id !== draggedNode.id));
    if ((newContainer?.id ?? undefined) === draggedNode.parentNode) return; // no change

    const newPosition = newContainer
        ? { x: absolutePosition.x - newContainer.position.x, y: absolutePosition.y - newContainer.position.y }
        : absolutePosition;

    setNodes((nds) =>
        nds.map((n) =>
            n.id === draggedNode.id
                ? { ...n, position: newPosition, parentNode: newContainer?.id, extent: newContainer ? 'parent' : undefined }
                : n,
        ),
    );
    setTimeout(() => updateNodeInternals(draggedNode.id), 0);

    // Same auto-wire as onDrop - moving an EXISTING node into a container
    // shouldn't require a separate manual reconnection any more than a
    // brand-new one does. Only wires in if nothing already connects this
    // node from within that container (e.g. it wasn't just briefly dragged
    // out and back into the same one).
    if (newContainer) {
      const tailId = findChainTailInContainer(newContainer.id, draggedNode.id);
      const alreadyWired = edges.some((e) => e.target === draggedNode.id && e.source === tailId);
      if (tailId && !alreadyWired) {
        setEdges((eds) => [
          ...eds,
          {
            id: `${tailId}-${draggedNode.id}`,
            source: tailId,
            target: draggedNode.id,
            type: 'deletable',
            data: { onDelete: deleteEdge },
          },
        ]);
      }

      // The actual bug this was reported against: a node dragged into a
      // container often already HAD an incoming edge from something outside
      // it (e.g. it used to be a top-level node connected straight from
      // "start"). Left alone, that edge silently bypasses the container
      // entirely - the compiler's outer traversal follows edges, sees
      // "start -> fieldValidator" directly, and never even notices the
      // repeatForEach exists, so it never compiles as a Map state at all.
      // Redirecting any such edge to target the CONTAINER instead (not the
      // child) is what actually keeps the outer flow's intent correct.
      const childIds = new Set(nodes.filter((n) => n.parentNode === newContainer.id).map((n) => n.id));
      setEdges((eds) =>
          eds.map((e) =>
              e.target === draggedNode.id && !childIds.has(e.source) && e.source !== newContainer.id
                  ? { ...e, target: newContainer.id }
                  : e,
          ),
      );
    }
  };

  function addStartNode() {
    setNodes([
      decorate({
        id: 'start',
        position: { x: 250, y: 60 },
        type: 'flowNode',
        data: { nodeType: 'documentInput', config: {}, hasError: false, selected: false },
      }),
    ]);
  }

  function toGraph(): FlowGraph {
    return {
      flowId: params.flowId,
      documentType,
      samplePayload,
      actionSampleResponses,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: (n.data as FlowNodeCardData).nodeType,
        position: n.position,
        config: n.data.config,
        parentId: n.parentNode,
        width: n.type === 'loopContainer' ? (n.width ?? LOOP_DEFAULT_WIDTH) : undefined,
        height: n.type === 'loopContainer' ? (n.height ?? LOOP_DEFAULT_HEIGHT) : undefined,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target!,
        sourceHandle: (e.sourceHandle as 'true' | 'false' | undefined) ?? 'default',
      })),
    };
  }

  async function handleSave() {
    await flowBuilderApi.saveDraft(params.flowId, toGraph());
    setStatusMessage({ type: 'success', text: 'Draft saved' });
    setTimeout(() => setStatusMessage(null), 2500);
  }

  async function handlePublish() {
    setPublishing(true);
    setViolations([]);
    setStatusMessage(null);
    try {
      await flowBuilderApi.saveDraft(params.flowId, toGraph());
      const result = await flowBuilderApi.publish(params.flowId, toGraph());
      setStatusMessage({ type: 'success', text: result.message });
    } catch (err) {
      const violationErr = err as Error & { violations?: GraphViolation[] };
      if (violationErr.violations) {
        setViolations(violationErr.violations);
        setStatusMessage({
          type: 'error',
          text: `${violationErr.violations.length} issue${
              violationErr.violations.length === 1 ? '' : 's'
          } - see highlighted nodes below.`,
        });
      } else {
        setStatusMessage({ type: 'error', text: violationErr.message });
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleTestFlow() {
    setTesting(true);
    try {
      await flowBuilderApi.testFlow(documentType, samplePayload ?? {});
      // Not polling to completion and showing a result inline anymore - that
      // was the ephemeral banner this replaced. The execution now writes a
      // real, persistent summary row (see flowExecutor's errorAggregator
      // case) - navigating to the history page is what actually shows the
      // result, and it's still there if you come back later, unlike before.
      router.push(`/flow-builder/${params.flowId}/executions`);
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  function openPayloadEditor() {
    setPayloadDraft(JSON.stringify(samplePayload ?? {}, null, 2));
    setEditingPayload(true);
  }

  function savePayloadEditor() {
    try {
      setSamplePayload(JSON.parse(payloadDraft));
      setEditingPayload(false);
    } catch {
      setStatusMessage({ type: 'error', text: "That's not valid JSON." });
    }
  }

  if (loading) return <p className="p-6 font-body-sm text-body-sm text-on-surface-variant">Loading…</p>;

  return (
      <div className="flex h-screen flex-col bg-[#F7F8FB]">
        <style>{`
        @keyframes flowNodePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35); }
          50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
      `}</style>

        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-5 py-2.5">
          <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
            <Link href="/flow-builder" className="hover:text-on-surface">
              Dashboard
            </Link>
            <span>/</span>
            <span className="font-medium text-on-surface">Flow Builder</span>
          </div>
          <div className="flex items-center gap-3">
            {statusMessage && (
                <span
                    className={`rounded px-2.5 py-1 text-xs font-medium ${
                        statusMessage.type === 'success' ? 'bg-secondary-container/20 text-secondary' : 'bg-error-container/20 text-error'
                    }`}
                >
              {statusMessage.text}
            </span>
            )}
            <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="rounded border border-outline-variant bg-background px-2 py-1 font-body-sm text-body-sm text-on-surface"
            >
              <option>Order</option>
              <option>Invoice</option>
            </select>
            <Button onClick={openPayloadEditor} variant="outline" size="sm">
              Sample payload
            </Button>
            <Button onClick={handleSave} variant="outline" size="sm">
              Save draft
            </Button>
            <Button
                onClick={handleTestFlow}
                disabled={testing}
                title="Runs the currently PUBLISHED flow, not unpublished draft changes"
                variant="outline"
                size="sm"
            >
              {testing ? 'Testing…' : 'Test flow'}
            </Button>
            <Link
                href={`/flow-builder/${params.flowId}/executions`}
                className="rounded-md border border-outline-variant px-3 py-1.5 font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
            >
              History
            </Link>
            <Button onClick={handlePublish} disabled={publishing} size="sm">
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>


        <div className="flex min-h-0 flex-1">
          <NodePalette />
          <div ref={canvasRef} className="relative flex-1 bg-background" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <button
                      onClick={addStartNode}
                      className="pointer-events-auto rounded-lg border border-dashed border-outline-variant bg-surface-container px-5 py-3 font-body-sm text-body-sm font-medium text-on-surface-variant shadow-sm hover:border-outline hover:text-on-surface"
                  >
                    + Add start node
                  </button>
                </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onNodeDragStop={onNodeDragStop}
                onPaneClick={() => setSelectedId(null)}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
            >
              <Background color="#464554" gap={20} />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        {selectedNode && selectedNode.type !== 'loopContainer' && (
            <SidePanel title={getNodeType(selectedNode.data.nodeType).label} onClose={() => setSelectedId(null)}>
              {selectedNode.parentNode && (
                  <div className="mb-4 rounded bg-primary-container/20 px-3 py-2 font-body-sm text-body-sm text-primary">
                    Inside a loop - fields below are relative to ONE item of the array being looped over, not the
                    full payload (e.g. "sku", not "payload.lineItems.0.sku").
                  </div>
              )}
              <NodeConfigPanel
                  nodeId={selectedNode.id}
                  nodeType={selectedNode.data.nodeType}
                  config={selectedNode.data.config}
                  onConfigChange={(patch) => updateNodeConfig(selectedNode.id, patch)}
                  onDelete={() => deleteNode(selectedNode.id)}
                  samplePayload={getEffectiveSamplePayload(selectedNode)}
                  actionSampleResponses={actionSampleResponses}
                  onCaptureResponse={handleCaptureActionResponse}
                  insideLoop={Boolean(selectedNode.parentNode)}
                  loopArrayPath={
                    selectedNode.parentNode
                        ? String(nodes.find((n) => n.id === selectedNode.parentNode)?.data.config?.arrayPath ?? '')
                        : undefined
                  }
              />
            </SidePanel>
        )}

        {editingPayload && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
              <div className="w-[32rem] rounded-lg bg-surface-container p-4 shadow-xl">
                <h2 className="mb-2 font-headline-md text-headline-md text-on-surface">Sample payload</h2>
                <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant">
                  Drives the field picker in node config - browse instead of typing raw paths.
                </p>
                <textarea
                    className="h-64 w-full rounded border border-outline-variant bg-background p-2 font-code-base text-code-base text-on-surface"
                    value={payloadDraft}
                    onChange={(e) => setPayloadDraft(e.target.value)}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => setEditingPayload(false)} variant="outline" size="sm">
                    Cancel
                  </Button>
                  <Button onClick={savePayloadEditor} size="sm">
                    Save
                  </Button>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}

export default function FlowBuilderPage() {
  return (
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
  );
}