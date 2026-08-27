// apps/web/app/flow-builder/[flowId]/page.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
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
  Node,
  NodeDragHandler,
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
  const { screenToFlowPosition } = useReactFlow();

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
  const [testResult, setTestResult] = useState<{
    status: string;
    validationStatus?: 'passed' | 'failed';
    output?: unknown;
    error?: string;
    cause?: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const violationsByNode = new Map(violations.map((v) => [v.nodeId, v.message]));
  const selectedNode = nodes.find((n) => n.id === selectedId) as Node<FlowNodeCardData> | undefined;

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
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, violations],
  );

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
    // Deleting a container orphans its children rather than deleting them
    // too - noDanglingParent (validator.ts) catches this and surfaces it as
    // a clear violation rather than silently losing work.
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }

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
    setTestResult(null);
    try {
      const { executionArn } = await flowBuilderApi.testFlow(documentType, samplePayload ?? {});
      const poll = async (): Promise<void> => {
        const result = await flowBuilderApi.getExecutionStatus(executionArn);
        if (result.status === 'RUNNING') {
          setTimeout(poll, 1500);
        } else {
          setTestResult(result);
          setTesting(false);
        }
      };
      poll();
    } catch (err) {
      setTestResult({ status: 'FAILED', error: (err as Error).message });
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

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

  return (
    <div className="flex h-screen flex-col bg-[#F7F8FB]">
      <style>{`
        @keyframes flowNodePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35); }
          50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
      `}</style>

      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/flow-builder" className="hover:text-gray-900">
            Dashboard
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-900">Flow Builder</span>
        </div>
        <div className="flex items-center gap-3">
          {statusMessage && (
            <span
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {statusMessage.text}
            </span>
          )}
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
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
          <Button onClick={handlePublish} disabled={publishing} size="sm">
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>

      {testResult && (
        <div
          className={`shrink-0 border-b px-5 py-2.5 text-xs ${
            testResult.validationStatus === 'failed'
              ? 'border-red-100 bg-red-50 text-red-800'
              : testResult.validationStatus === 'passed'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : testResult.status === 'SUCCEEDED'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-red-100 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {testResult.validationStatus
                ? `Validation: ${testResult.validationStatus === 'failed' ? 'FAILED' : 'PASSED'}`
                : `Execution: ${testResult.status}`}
              {testResult.validationStatus && (
                <span className="ml-2 font-normal text-gray-400">(execution {testResult.status})</span>
              )}
            </span>
            <button onClick={() => setTestResult(null)} className="text-gray-400 hover:text-gray-700">
              ✕
            </button>
          </div>
          {Boolean(testResult.error || testResult.output) && (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
              {testResult.error ? `${testResult.error}: ${testResult.cause}` : JSON.stringify(testResult.output, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <NodePalette />
        <div ref={canvasRef} className="relative flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <button
                onClick={addStartNode}
                className="pointer-events-auto rounded-lg border border-dashed border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-600 shadow-sm hover:border-gray-400 hover:text-gray-900"
              >
                + Add start node
              </button>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
          >
            <Background color="#E4E7EC" gap={20} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      {selectedNode && selectedNode.type !== 'loopContainer' && (
        <SidePanel title={getNodeType(selectedNode.data.nodeType).label} onClose={() => setSelectedId(null)}>
          <NodeConfigPanel
            nodeId={selectedNode.id}
            nodeType={selectedNode.data.nodeType}
            config={selectedNode.data.config}
            onConfigChange={(patch) => updateNodeConfig(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            samplePayload={samplePayload}
            actionSampleResponses={actionSampleResponses}
            onCaptureResponse={handleCaptureActionResponse}
          />
        </SidePanel>
      )}
      {selectedNode && selectedNode.type === 'loopContainer' && (
        <SidePanel title="Repeat For Each" onClose={() => setSelectedId(null)}>
          <NodeConfigPanel
            nodeId={selectedNode.id}
            nodeType="repeatForEach"
            config={selectedNode.data.config}
            onConfigChange={(patch) => updateNodeConfig(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            samplePayload={samplePayload}
            actionSampleResponses={actionSampleResponses}
            onCaptureResponse={handleCaptureActionResponse}
          />
        </SidePanel>
      )}

      {editingPayload && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
          <div className="w-[32rem] rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-2 text-sm font-medium text-gray-900">Sample payload</h2>
            <p className="mb-2 text-xs text-gray-500">
              Drives the field picker in node config - browse instead of typing raw paths.
            </p>
            <textarea
              className="h-64 w-full rounded border border-gray-200 p-2 font-mono text-xs"
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
