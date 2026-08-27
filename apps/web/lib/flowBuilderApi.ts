// apps/web/lib/flowBuilderApi.ts
//
// Talks to the new FlowBuilderStack's API - a genuinely different backend
// from the old scopes-and-rules validator (lib/api.ts). Kept as its own
// client rather than merged in, since the data model is unrelated.

import type { FlowGraph } from '@workspace/flow-compiler';

const BASE = process.env.NEXT_PUBLIC_FLOW_BUILDER_API_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message ?? `Request failed: ${res.status}`) as Error & { violations?: unknown };
    err.violations = body.violations;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const flowBuilderApi = {
  listDrafts: (documentType: string) =>
    request<FlowGraph[]>(`/flow-drafts?documentType=${encodeURIComponent(documentType)}`),
  createDraft: (documentType: string) =>
    request<FlowGraph>('/flow-drafts', {
      method: 'POST',
      body: JSON.stringify({ documentType, nodes: [], edges: [] }),
    }),
  getDraft: (flowId: string) => request<FlowGraph>(`/flow-drafts/${flowId}`),
  saveDraft: (flowId: string, graph: FlowGraph) =>
    request<FlowGraph>(`/flow-drafts/${flowId}`, { method: 'PUT', body: JSON.stringify(graph) }),
  publish: (flowId: string, graph: FlowGraph) =>
    request<{ stateMachineArn: string; message: string }>(`/flow-drafts/${flowId}/publish`, {
      method: 'POST',
      body: JSON.stringify(graph),
    }),
  // Manual trigger - runs whatever's currently PUBLISHED for a document type,
  // not the draft being edited. Publish first if you want to test changes.
  testFlow: (documentType: string, payload: Record<string, unknown>) =>
    request<{ executionArn: string }>('/test-flow', {
      method: 'POST',
      body: JSON.stringify({ documentType, payload }),
    }),
  getExecutionStatus: (executionArn: string) =>
    request<{
      status: string;
      validationStatus?: 'passed' | 'failed';
      output?: unknown;
      error?: string;
      cause?: string;
    }>(`/test-flow?executionArn=${encodeURIComponent(executionArn)}`),
  getPublishedFlow: (documentType: string) =>
    request<{ published: { flowId: string; publishedAt: string } | null }>(
      `/document-types/${encodeURIComponent(documentType)}/published`,
    ),
  // Postman-style "Send test request" - resolves + sends a real request using
  // the exact same resolver the live executor uses server-side, so this is a
  // genuine test of what will actually happen, not a separate simulation.
  testHttpAction: (config: Record<string, unknown>, samplePayload: Record<string, unknown>) =>
    request<{
      request: { url: string; method: string; headers: Record<string, string>; body?: string };
      response?: { status: number; statusText: string; headers: Record<string, string>; body: string; timeMs: number };
      error?: string;
      timeMs?: number;
    }>('/test-http-action', {
      method: 'POST',
      body: JSON.stringify({ config, samplePayload }),
    }),
  // Real, persistent history - replaces relying on a single ephemeral
  // executionArn held in local component state, which was gone the moment
  // you navigated away.
  listExecutionHistory: (documentType: string) =>
    request<
      Array<{ documentType: string; evaluatedAt: string; executionId: string; status: string; violationCount: number }>
    >(`/document-types/${encodeURIComponent(documentType)}/executions`),
  getExecutionHistoryDetail: (documentType: string, executionId: string) =>
    request<{
      documentType: string;
      evaluatedAt: string;
      executionId: string;
      status: string;
      violationCount: number;
      detail: { payload: unknown; checkResults: unknown; violations: unknown[] };
    }>(`/document-types/${encodeURIComponent(documentType)}/executions/${encodeURIComponent(executionId)}`),
};
