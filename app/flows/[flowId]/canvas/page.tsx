// web/app/canvas/page.tsx
//
// Guided visual builder. Nodes are still freely repositionable (drag to
// rearrange), but CREATION is guided via "+" affordances on Start/Scope nodes -
// mirroring how Zapier/Shopify Flow actually work despite their own "drag and
// drop" marketing copy: neither lets you drop an arbitrary disconnected node:
// insertion always happens at a specific "+" point with a constrained next step.
//
// Nothing about the backend changed to support this: no flow-to-ASL compilation,
// no new API routes. Scope nodes still map 1:1 to FlowDefinition.scopes, rule
// nodes still map 1:1 to RuleStore items - this page just replaced every raw
// path/JSON input with pickers built from a real sample payload.

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { api } from '../../../../lib/api';
import { FlowDefinition, Rule, ExecutionStatus } from '../../../../lib/types';
import { buildFieldTree, getValueAtPath, FieldNode as TreeNode } from '../../../../lib/fieldTree';
import { SidePanel } from '../../../../components/SidePanel';
import { SentenceRuleEditor } from '../../../../components/SentenceRuleEditor';
import { FieldPickerButton } from '../../../../components/FieldPickerButton';
import { ScopeNode, ScopeNodeData } from '../../../../components/nodes/ScopeNode';
import { RuleNode, RuleNodeData } from '../../../../components/nodes/RuleNode';
import { StartNode, StartNodeData } from '../../../../components/nodes/StartNode';
import { EndNode } from '../../../../components/nodes/EndNode';
import { DeletableEdge, DeletableEdgeData } from '../../../../components/edges/DeletableEdge';

const nodeTypes = { scope: ScopeNode, rule: RuleNode, start: StartNode, end: EndNode };
const edgeTypes = { membership: DeletableEdge };

const START_ID = 'start';
const END_ID = 'end';
// Vertical spacing between rules stacked under the same group - used both when
// loading a saved flow and when adding a rule live, so the two paths produce
// the same layout.
const RULE_ROW_HEIGHT = 130;

function blankRule(kind: Rule['kind'], flowId: string): Rule {
  return {
    tenantId: '',
    flowId,
    ruleId: `new-rule-${Date.now()}`,
    version: 0,
    active: true,
    scopeId: '',
    kind,
  };
}

// ---------- Onboarding gate: nothing else can be authored without this ----------

const BLANK_SAMPLE = JSON.stringify(
  { orderId: 'ORDER-123', poNumber: 'PO-1001', lineItems: [{ sku: 'SKU-A', unitPrice: 12.0, quantity: 2 }] },
  null,
  2,
);

/** Shared textarea+validate+save form, used both for first-time onboarding and
 * for editing the sample payload later from the canvas toolbar. */
function SamplePayloadForm({
  initialText,
  ctaLabel,
  onSave,
}: {
  initialText: string;
  ctaLabel: string;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('That\u2019s not valid JSON - check for a missing comma or bracket.');
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        className="h-64 w-full rounded border border-gray-300 p-3 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving\u2026' : ctaLabel}
      </button>
    </div>
  );
}

function SamplePayloadOnboarding({
  flowId,
  onSaved,
}: {
  flowId: string;
  onSaved: (payload: Record<string, unknown>) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-medium">Let's start with a real example</h1>
      <p className="mt-1 text-sm text-gray-600">
        Paste one real order payload below. Every field you'll pick from later - which items to repeat
        over, which values to compare - comes from this example, so you never have to type a raw field
        path from memory.
      </p>
      <div className="mt-4">
        <SamplePayloadForm
          initialText={BLANK_SAMPLE}
          ctaLabel="Continue"
          onSave={async (parsed) => {
            await api.saveFlowDefinition(flowId, { samplePayload: parsed });
            onSaved(parsed);
          }}
        />
      </div>
    </div>
  );
}

function CanvasInner({
  flowId,
  samplePayload,
  onSamplePayloadChange,
  adapterId,
  onAdapterIdChange,
}: {
  flowId: string;
  samplePayload: Record<string, unknown>;
  onSamplePayloadChange: (payload: Record<string, unknown>) => void;
  adapterId: string;
  onAdapterIdChange: (adapterId: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<
    ScopeNodeData | RuleNodeData | StartNodeData | Record<string, unknown>
  >([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DeletableEdgeData>([]);
  // Lets onQuickAddRule read up-to-date edges (to count existing siblings in a
  // group) without depending on `edges` directly, which would change the
  // callback's identity on every edge change - and since scope nodes store
  // whatever onQuickAddRule reference existed at creation time, a
  // stale-until-node-recreated closure is exactly the bug that caused before.
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    executionId: string;
    status?: ExecutionStatus;
    violationCount?: number;
    error?: string;
  } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingSamplePayload, setEditingSamplePayload] = useState(false);
  const { screenToFlowPosition } = useReactFlow();


  const rootTree = useMemo(() => buildFieldTree(samplePayload), [samplePayload]);
  const editingNode = nodes.find((n) => n.id === editingNodeId);

  // The item-level tree a rule's field pickers should browse: one example item
  // from whichever scope the rule belongs to (or the whole payload for the
  // 'order'/whole-root scope) - not the raw array, and not the whole payload
  // unless that's genuinely what the scope iterates.
  function itemTreeForScope(scopeNode: Node | undefined): TreeNode {
    if (!scopeNode) return rootTree;
    const itemsPath = (scopeNode.data as ScopeNodeData).itemsPath;
    if (!itemsPath || itemsPath === '$') return rootTree;
    const arrayValue = getValueAtPath(samplePayload, itemsPath);
    const sampleItem = Array.isArray(arrayValue) ? arrayValue[0] : arrayValue;
    // Root path must be '$', not itemsPath - at runtime, resolveValue operates
    // on a single item (ctx.item), which has no nested `lineItems` field. Using
    // itemsPath here was producing picker paths like "lineItems.quantity"
    // instead of "quantity", which resolves to undefined against the actual item.
    return buildFieldTree(sampleItem ?? {}, '$', (scopeNode.data as ScopeNodeData).label ?? itemsPath);
  }

  function scopeNodeForRule(ruleNodeId: string): Node | undefined {
    const membershipEdge = edges.find((e) => e.id.startsWith('member-') && e.target === ruleNodeId);
    return nodes.find((n) => n.id === membershipEdge?.source);
  }

  function contextKeysForScope(scopeNodeId: string): string[] {
    const ruleNodeIds = edges
      .filter((e) => e.id.startsWith('member-') && e.source === scopeNodeId)
      .map((e) => e.target);
    return nodes
      .filter((n) => ruleNodeIds.includes(n.id) && n.type === 'rule')
      .map((n) => (n.data as RuleNodeData).rule)
      .filter((r) => r.kind === 'derivation' && r.writesTo)
      .map((r) => r.writesTo!) as string[];
  }

  const onAddScope = useCallback(() => {
    const id = `scope:new-${Date.now()}`;
    setNodes((nds) => {
      const existingScopeCount = nds.filter((n) => n.type === 'scope').length;
      return [
        ...nds,
        {
          id,
          type: 'scope',
          position: { x: 80 + existingScopeCount * 260, y: 140 },
          data: { scopeId: '', itemsPath: '', onEdit: setEditingNodeId, onQuickAddRule },
        },
      ];
    });
    // Only the Start->scope edge here - End connects from each *rule*, not the
    // scope itself (see onQuickAddRule), since rules are the actual leaf steps
    // whose results feed the aggregate. A brand-new scope with no rules yet has
    // no path to End until a rule is added - that's correct, since an empty
    // scope genuinely does nothing.
    setEdges((eds) => [
      ...eds,
      { id: `start-${id}`, source: START_ID, target: id, style: { stroke: '#9ca3af' }, deletable: false },
    ]);
    setEditingNodeId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges]);

  const onQuickAddRule = useCallback(
    (scopeNodeId: string) => {
      const rule = blankRule('validation', flowId);
      const ruleNodeId = `rule:${rule.ruleId}`;

      setNodes((nds) => {
        const scopeNode = nds.find((n) => n.id === scopeNodeId);
        const siblingCount = nds.filter(
          (n) =>
            n.type === 'rule' &&
            edgesRef.current.some(
              (e) => e.id.startsWith('member-') && e.source === scopeNodeId && e.target === n.id,
            ),
        ).length;
        const position = {
          x: scopeNode?.position.x ?? 80,
          y: (scopeNode?.position.y ?? 40) + 140 + siblingCount * RULE_ROW_HEIGHT,
        };
        return [...nds, { id: ruleNodeId, type: 'rule', position, data: { rule, onEdit: setEditingNodeId } }];
      });

      setEdges((eds) => [
        ...eds,
        {
          id: `member-${rule.ruleId}`,
          source: scopeNodeId,
          target: ruleNodeId,
          type: 'membership',
          style: { stroke: '#6366f1' },
          data: { onDelete: handleDeleteEdge },
        },
        { id: `end-${ruleNodeId}`, source: ruleNodeId, target: END_ID, style: { stroke: '#9ca3af' }, deletable: false },
      ]);
      setEditingNodeId(ruleNodeId);
    },
    [setEdges, setNodes, flowId],
  );

  // ---------- Load: FlowDefinition + Rules -> graph ----------
  useEffect(() => {
    async function load() {
      const [flow, rules] = await Promise.all([
        api.getFlowDefinition(flowId).catch(() => null),
        api.listRules(flowId).catch(() => []),
      ]);

      const startNode: Node = {
        id: START_ID,
        type: 'start',
        position: { x: 200, y: 0 },
        data: { onAddScope },
        draggable: false,
        deletable: false,
      };

      const scopeNodes: Node[] = (flow?.scopes ?? []).map((scope, i) => {
        const label = scope.itemsPath === '$' ? 'the whole order' : `each ${scope.scopeId}`;
        return {
          id: `scope:${scope.scopeId}`,
          type: 'scope',
          position: { x: 80 + i * 260, y: 140 },
          data: { scopeId: scope.scopeId, itemsPath: scope.itemsPath, label, onEdit: setEditingNodeId, onQuickAddRule },
        };
      });

      // Group by scopeId first - a per-scope counter is what actually prevents
      // overlap. The previous version used the rule's index in the flat global
      // `rules` array, which has no relationship to how many rules share a
      // scope, causing collisions whenever two rules under the same group
      // landed on the same (x, y % 5-row) by coincidence.
      const rulesByScopeId = new Map<string, Rule[]>();
      for (const rule of rules) {
        const list = rulesByScopeId.get(rule.scopeId) ?? [];
        list.push(rule);
        rulesByScopeId.set(rule.scopeId, list);
      }

      const ruleNodes: Node[] = [];
      rulesByScopeId.forEach((scopeRules, scopeId) => {
        const scopeIndex = scopeNodes.findIndex((s) => s.data.scopeId === scopeId);
        const baseX = 80 + (scopeIndex >= 0 ? scopeIndex : 0) * 260;
        scopeRules.forEach((rule, indexWithinScope) => {
          ruleNodes.push({
            id: `rule:${rule.ruleId}`,
            type: 'rule',
            position: { x: baseX, y: 280 + indexWithinScope * RULE_ROW_HEIGHT },
            data: { rule, onEdit: setEditingNodeId },
          });
        });
      });

      const maxRuleY = ruleNodes.length ? Math.max(...ruleNodes.map((n) => n.position.y)) : 280;
      const centerX = scopeNodes.length ? 80 + ((scopeNodes.length - 1) * 260) / 2 : 200;

      const endNode: Node = {
        id: END_ID,
        type: 'end',
        position: { x: centerX, y: maxRuleY + 150 },
        data: {},
        draggable: false,
        deletable: false,
      };

      const membershipEdges: Edge[] = rules
        .filter((r) => r.scopeId)
        .map((r) => ({
          id: `member-${r.ruleId}`,
          source: `scope:${r.scopeId}`,
          target: `rule:${r.ruleId}`,
          type: 'membership',
          style: { stroke: '#6366f1' },
          data: { onDelete: handleDeleteEdge },
        }));

      const dependencyEdges: Edge[] = [];
      for (const source of rules) {
        if (source.kind !== 'derivation' || !source.writesTo) continue;
        for (const target of rules) {
          if (target.ruleId === source.ruleId) continue;
          const gateText = target.appliesWhen ? JSON.stringify(target.appliesWhen) : '';
          if (gateText.includes(`"var":"${source.writesTo}"`)) {
            dependencyEdges.push({
              id: `dep-${source.ruleId}-${target.ruleId}`,
              source: `rule:${source.ruleId}`,
              target: `rule:${target.ruleId}`,
              style: { stroke: '#9ca3af', strokeDasharray: '4 3' },
              label: 'gates',
              deletable: false,
            });
          }
        }
      }

      const startEdges: Edge[] = scopeNodes.map((s) => ({
        id: `start-${s.id}`,
        source: START_ID,
        target: s.id,
        style: { stroke: '#9ca3af' },
        deletable: false,
      }));
      const endEdges: Edge[] = ruleNodes.map((r) => ({
        id: `end-${r.id}`,
        source: r.id,
        target: END_ID,
        style: { stroke: '#9ca3af' },
        deletable: false,
      }));

      setNodes([startNode, ...scopeNodes, ...ruleNodes, endNode]);
      setEdges([...startEdges, ...membershipEdges, ...dependencyEdges, ...endEdges]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source?.startsWith('scope:') || !connection.target?.startsWith('rule:')) return;
      setEdges((eds) => [
        ...eds.filter((e) => !(e.id.startsWith('member-') && e.target === connection.target)),
        {
          ...connection,
          id: `member-${connection.target?.replace('rule:', '')}`,
          type: 'membership',
          style: { stroke: '#6366f1' },
          data: { onDelete: handleDeleteEdge },
        } as Edge,
      ]);
    },
    [setEdges],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [setEdges],
  );

  // Deletes a rule: removes it from the canvas and soft-deletes it in RuleStore
  // (active: false, via the existing DELETE endpoint). Used both by the side
  // panel's explicit "Delete rule" button and by keyboard delete (onNodesDelete
  // below) - same cleanup either way, so canvas and backend never diverge.
  const handleDeleteRuleNode = useCallback(
    (ruleNodeId: string, opts?: { skipCanvasRemoval?: boolean }) => {
      const target = nodes.find((n) => n.id === ruleNodeId);
      if (target?.type === 'rule') {
        api.deleteRule(flowId, (target.data as RuleNodeData).rule.ruleId).catch(() => {
          // best-effort - if this fails the rule just stays active in the backend,
          // out of sync with the canvas; a retry via the Rules page is the fallback.
        });
      }
      if (!opts?.skipCanvasRemoval) {
        setNodes((nds) => nds.filter((n) => n.id !== ruleNodeId));
        setEdges((eds) => eds.filter((e) => e.source !== ruleNodeId && e.target !== ruleNodeId));
      }
      setEditingNodeId((cur) => (cur === ruleNodeId ? null : cur));
    },
    [nodes, flowId, setNodes, setEdges],
  );

  // Deleting a group cascades to every rule attached to it - a rule left
  // pointing at a scopeId that no longer exists in FlowDefinition.scopes would
  // just silently never run again, which is worse than an explicit, visible delete.
  const handleDeleteScopeNode = useCallback(
    (scopeNodeId: string, opts?: { skipConfirm?: boolean; skipCanvasRemoval?: boolean }) => {
      const attachedRuleNodeIds = edges
        .filter((e) => e.id.startsWith('member-') && e.source === scopeNodeId)
        .map((e) => e.target);

      if (!opts?.skipConfirm) {
        const ok = window.confirm(
          attachedRuleNodeIds.length > 0
            ? `This group has ${attachedRuleNodeIds.length} rule(s) attached - deleting it deletes those rules too. Continue?`
            : 'Delete this group?',
        );
        if (!ok) return;
      }

      attachedRuleNodeIds.forEach((ruleNodeId) => handleDeleteRuleNode(ruleNodeId, { skipCanvasRemoval: true }));

      if (!opts?.skipCanvasRemoval) {
        setNodes((nds) => nds.filter((n) => n.id !== scopeNodeId && !attachedRuleNodeIds.includes(n.id)));
        setEdges((eds) =>
          eds.filter(
            (e) =>
              e.source !== scopeNodeId &&
              e.target !== scopeNodeId &&
              !attachedRuleNodeIds.includes(e.source) &&
              !attachedRuleNodeIds.includes(e.target),
          ),
        );
      }
      setEditingNodeId((cur) => (cur === scopeNodeId || attachedRuleNodeIds.includes(cur ?? '') ? null : cur));
    },
    [edges, handleDeleteRuleNode, setNodes, setEdges],
  );

  // Keyboard-delete (Backspace/Delete on a selected node) already removed the
  // node+its edges from canvas state by the time this fires - only the backend
  // side-effect (soft-deleting rules) still needs to happen here. No confirm()
  // dialog on this path, since the person already performed the delete gesture.
  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) {
        if (n.type === 'rule') {
          handleDeleteRuleNode(n.id, { skipCanvasRemoval: true });
        } else if (n.type === 'scope') {
          handleDeleteScopeNode(n.id, { skipConfirm: true, skipCanvasRemoval: true });
        }
      }
    },
    [handleDeleteRuleNode, handleDeleteScopeNode],
  );

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setSaveMessage(null);
    try {
      const scopeNodes = nodes.filter((n) => n.type === 'scope');
      const ruleNodes = nodes.filter((n) => n.type === 'rule');

      const scopes = scopeNodes.map((n) => ({
        scopeId: (n.data as ScopeNodeData).scopeId,
        itemsPath: (n.data as ScopeNodeData).itemsPath,
      }));

      const flowDefinition: Partial<FlowDefinition> = {
        scopes,
        adapterId,
        executionMode: 'collectAll',
        samplePayload,
      };
      await api.saveFlowDefinition(flowId, flowDefinition);

      for (const ruleNode of ruleNodes) {
        const membershipEdge = edges.find((e) => e.id.startsWith('member-') && e.target === ruleNode.id);
        const scopeNode = scopeNodes.find((s) => s.id === membershipEdge?.source);
        const rule = (ruleNode.data as RuleNodeData).rule;
        const updatedRule: Rule = {
          ...rule,
          flowId,
          scopeId: scopeNode ? (scopeNode.data as ScopeNodeData).scopeId : rule.scopeId,
        };
        await api.saveRule(flowId, updatedRule.ruleId, updatedRule);
      }
      setSaveMessage({ type: 'success', text: 'Flow saved' });
      return true;
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? `Save failed: ${err.message}` : 'Save failed',
      });
      return false;
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  // Runs a real execution against what's actually saved - not unsaved canvas
  // edits - so save first, then start, then poll the executions endpoint until
  // the aggregate Lambda has written a result (the state machine is async;
  // StartExecution only returns an executionId, not the outcome).
  async function handleTestNow() {
    const saved = await handleSave();
    if (!saved) return;

    setTesting(true);
    setTestResult(null);
    try {
      const { executionId } = await api.testFlow(flowId, samplePayload);
      setTestResult({ executionId });

      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          const detail = await api.getExecutionDetail(flowId, executionId);
          // 'failed' is never a truly final status in this system - the state
          // machine's Choice state always routes a blocking violation into the
          // review loop, so 'failed' here just means "Aggregate wrote its
          // first pass, awaitCorrection hasn't patched it to needs_review yet."
          // Only settle on genuinely terminal/waiting states.
          if (detail.status === 'passed' || detail.status === 'warned' || detail.status === 'needs_review') {
            setTestResult({ executionId, status: detail.status, violationCount: detail.violations.length });
            setTesting(false);
            return;
          }
          // status === 'failed' (transient) - keep polling rather than settling here.
        } catch {
          // Not written yet - keep polling.
        }
      }
      setTestResult({ executionId, error: 'Still running after 30s - check the Executions tab shortly.' });
    } catch (err) {
      setTestResult({
        executionId: '',
        error: err instanceof Error ? err.message : 'Failed to start test execution',
      });
    } finally {
      setTesting(false);
    }
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
  }

  const panelContent = useMemo(() => {
    if (!editingNode) return null;

    if (editingNode.type === 'scope') {
      const data = editingNode.data as ScopeNodeData;
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Choose what this group of rules should repeat over - pick an array field (like line items or
            shipments) to run the rules once per entry, or the whole order to run them once.
          </p>
          <FieldPickerButton
            tree={rootTree}
            mode="array"
            allowWholeRoot
            value={data.label ?? ''}
            placeholder="Choose what to repeat over…"
            onChange={(node) => {
              const scopeId = node.path === '$' ? 'order' : node.path.split('.').pop()!;
              const label = node.path === '$' ? 'the whole order' : `each ${scopeId}`;
              updateNodeData(editingNode.id, { scopeId, itemsPath: node.path, label });
            }}
          />
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => handleDeleteScopeNode(editingNode.id)}
              className="text-xs text-red-600 hover:text-red-700 hover:underline"
            >
              Delete this group
            </button>
          </div>
        </div>
      );
    }

    if (editingNode.type === 'rule') {
      const data = editingNode.data as RuleNodeData;
      const scopeNode = scopeNodeForRule(editingNode.id);
      const itemTree = itemTreeForScope(scopeNode);
      const contextKeys = scopeNode ? contextKeysForScope(scopeNode.id) : [];
      return (
        <div className="space-y-3">
          <SentenceRuleEditor
            initial={data.rule}
            itemTree={itemTree}
            availableContextKeys={contextKeys}
            onSave={async (rule) => {
              updateNodeData(editingNode.id, { rule });
              setEditingNodeId(null);
            }}
          />
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => handleDeleteRuleNode(editingNode.id)}
              className="text-xs text-red-600 hover:text-red-700 hover:underline"
            >
              Delete this rule
            </button>
          </div>
        </div>
      );
    }

    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNode, nodes, edges, handleDeleteRuleNode, handleDeleteScopeNode]);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading canvas…</p>;

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          {testResult && (
            <span
              className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium shadow ${
                testResult.error
                  ? 'bg-red-50 text-red-700'
                  : testResult.status === 'failed'
                    ? 'bg-red-50 text-red-700'
                    : testResult.status === 'needs_review'
                      ? 'bg-blue-50 text-blue-700'
                      : testResult.status === 'warned'
                        ? 'bg-amber-50 text-amber-700'
                        : testResult.status === 'passed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
              }`}
            >
              {testResult.error
                ? testResult.error
                : testResult.status
                  ? testResult.status === 'needs_review'
                    ? `Needs review (${testResult.violationCount} violation${testResult.violationCount === 1 ? '' : 's'})`
                    : `Test ${testResult.status} (${testResult.violationCount} violation${
                        testResult.violationCount === 1 ? '' : 's'
                      })`
                  : 'Running test\u2026'}
              {testResult.status && testResult.executionId && (
                <Link
                  href={`/flows/${flowId}/executions/${testResult.executionId}`}
                  className="underline hover:no-underline"
                >
                  View details
                </Link>
              )}
            </span>
          )}
          {saveMessage && (
            <span
              className={`rounded px-3 py-1.5 text-sm font-medium shadow ${
                saveMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {saveMessage.type === 'success' ? '\u2713 ' : ''}
              {saveMessage.text}
            </span>
          )}
          <button
            onClick={() => setEditingSamplePayload(true)}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow hover:bg-gray-50"
          >
            Flow settings
          </button>
          <button
            onClick={handleTestNow}
            disabled={testing || saving}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? 'Testing\u2026' : 'Test now'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
          >
            {saving ? 'Saving\u2026' : 'Save flow'}
          </button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={handleNodesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {editingSamplePayload && (
        <SidePanel title="Flow settings" onClose={() => setEditingSamplePayload(false)}>
          <div className="mb-5">
            <label className="mb-1 block text-xs font-medium text-gray-500">ERP adapter</label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={adapterId}
              onChange={(e) => onAdapterIdChange(e.target.value)}
            >
              <option value="mock">Mock (in-memory test data)</option>
              <option value="myob-advanced">MYOB Advanced (not implemented yet)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Takes effect on the next "Save flow" click. Only Mock actually works right now - MYOB
              Advanced is a stub; selecting it will make executions fail with a clear error until it's
              implemented.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="mb-3 text-sm text-gray-600">
              Updating the example payload doesn't change any saved rules - it only changes what the field
              pickers show you going forward. If a rule references a field that no longer exists in the new
              example, it'll still run against the real payload at execution time; only the picker's preview
              changes.
            </p>
            <SamplePayloadForm
              initialText={JSON.stringify(samplePayload, null, 2)}
              ctaLabel="Save example payload"
              onSave={async (parsed) => {
                await api.saveFlowDefinition(flowId, { samplePayload: parsed });
                onSamplePayloadChange(parsed);
                setEditingSamplePayload(false);
              }}
            />
          </div>
        </SidePanel>
      )}

      {editingNode && (editingNode.type === 'scope' || editingNode.type === 'rule') && (
        <SidePanel
          title={editingNode.type === 'scope' ? 'Repeat for each\u2026' : 'Edit rule'}
          onClose={() => setEditingNodeId(null)}
        >
          {panelContent}
        </SidePanel>
      )}
    </div>
  );
}

export default function CanvasPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const [samplePayload, setSamplePayload] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [adapterId, setAdapterId] = useState<string>('mock');

  useEffect(() => {
    api
      .getFlowDefinition(flowId)
      .then((flow) => {
        setSamplePayload(flow.samplePayload ?? null);
        setAdapterId(flow.adapterId ?? 'mock');
      })
      .catch(() => setSamplePayload(null));
  }, [flowId]);

  if (samplePayload === undefined) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (samplePayload === null) return <SamplePayloadOnboarding flowId={flowId} onSaved={setSamplePayload} />;

  return (
    <ReactFlowProvider>
      <CanvasInner
        flowId={flowId}
        samplePayload={samplePayload}
        onSamplePayloadChange={setSamplePayload}
        adapterId={adapterId}
        onAdapterIdChange={setAdapterId}
      />
    </ReactFlowProvider>
  );
}
