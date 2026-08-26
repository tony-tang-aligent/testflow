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
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlowGraph, GraphViolation } from '@workspace/flow-compiler';
import { flowBuilderApi } from '../../../lib/flowBuilderApi';
import { NodePalette } from '../../../components/flow-builder/NodePalette';
import { NodeConfigPanel } from '../../../components/flow-builder/NodeConfigPanel';
import { FlowNodeCard, FlowNodeCardData } from '../../../components/flow-builder/FlowNodeCard';

const nodeTypes = {
  flowNode: ({ data }: { data: FlowNodeCardData }) => <FlowNodeCard data={data} />,
};

function CanvasInner() {
  const params = useParams<{ flowId: string }>();
  const { screenToFlowPosition } = useReactFlow();

  const [documentType, setDocumentType] = useState('Order');
  const [samplePayload, setSamplePayload] = useState<Record<string, unknown> | undefined>(undefined);
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadDraft, setPayloadDraft] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeCardData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [violations, setViolations] = useState<GraphViolation[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const violationsByNode = new Map(violations.map((v) => [v.nodeId, v.message]));
  const selectedNode = nodes.find((n) => n.id === selectedId);

  const decorate = useCallback(
    (n: Node<FlowNodeCardData>): Node<FlowNodeCardData> => ({
      ...n,
      type: 'flowNode',
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
        setNodes(
          graph.nodes.map((n) =>
            decorate({
              id: n.id,
              position: n.position,
              type: 'flowNode',
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
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }

  function onConnect(connection: Connection) {
    const style =
      connection.sourceHandle === 'false'
        ? { stroke: '#EF4444' }
        : connection.sourceHandle === 'true'
          ? { stroke: '#22C55E' }
          : undefined;
    setEdges((eds) => addEdge({ ...connection, style }, eds));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/flow-node-type');
    if (!nodeType) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `${nodeType}_${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      decorate({ id, position, type: 'flowNode', data: { nodeType, config: {}, hasError: false, selected: false } }),
    ]);
  }

  function toGraph(): FlowGraph {
    return {
      flowId: params.flowId,
      documentType,
      samplePayload,
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType, position: n.position, config: n.data.config })),
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
            className="rounded border border-gray-200 px-2 py-1 text-xs"
          >
            <option>Order</option>
            <option>Invoice</option>
          </select>
          <button
            onClick={openPayloadEditor}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Sample payload
          </button>
          <button
            onClick={handleSave}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Save draft
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {selectedNode ? (
          <NodeConfigPanel
            nodeType={selectedNode.data.nodeType}
            config={selectedNode.data.config}
            onConfigChange={(patch) => updateNodeConfig(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedId(null)}
            samplePayload={samplePayload}
          />
        ) : (
          <NodePalette />
        )}
        <div ref={canvasRef} className="flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background color="#E4E7EC" gap={20} />
            <Controls />
          </ReactFlow>
        </div>
      </div>

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
              <button
                onClick={() => setEditingPayload(false)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={savePayloadEditor}
                className="rounded bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white"
              >
                Save
              </button>
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
