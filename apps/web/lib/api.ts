// apps/web/lib/api.ts
//
// Every call here hits apps/web's OWN Next.js routes (same-origin, relative
// paths) - never the flow-engine HttpApi directly. The proxy routes under
// app/api/clients/[clientId]/... do the real work: check the signed-in user's
// session, verify they can access this clientId via packages/db, and only
// then forward to the flow engine with the internal shared secret attached
// server-side. See lib/internalApiClient.ts and lib/requireClientAccess.ts.
//
// clientId is now an explicit parameter everywhere - it's what used to be the
// hardcoded CURRENT_TENANT_ID placeholder, now resolved per-request from
// whichever Client the user is currently acting on (the [clientId] URL segment).

import { Rule, FlowDefinition, ExecutionSummary, ExecutionDetail, DismissedWarning } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ---------- Flows (a Client can have several - e.g. "AP invoice validation", "PO order validation") ----------
  listFlows: (clientId: string) => request<FlowDefinition[]>(`/api/clients/${clientId}/flows`),
  createFlow: (clientId: string, name: string) =>
    request<FlowDefinition>(`/api/clients/${clientId}/flows`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getFlowDefinition: (clientId: string, flowId: string) =>
    request<FlowDefinition>(`/api/clients/${clientId}/flows/${flowId}`),
  saveFlowDefinition: (clientId: string, flowId: string, flow: Partial<FlowDefinition>) =>
    request<FlowDefinition>(`/api/clients/${clientId}/flows/${flowId}`, {
      method: 'PUT',
      body: JSON.stringify(flow),
    }),
  deleteFlow: (clientId: string, flowId: string) =>
    request<void>(`/api/clients/${clientId}/flows/${flowId}`, { method: 'DELETE' }),

  // ---------- Rules (scoped to one flow) ----------
  listRules: (clientId: string, flowId: string) =>
    request<Rule[]>(`/api/clients/${clientId}/flows/${flowId}/rules`),
  getRule: (clientId: string, flowId: string, ruleId: string) =>
    request<Rule>(`/api/clients/${clientId}/flows/${flowId}/rules/${ruleId}`),
  saveRule: (clientId: string, flowId: string, ruleId: string, rule: Partial<Rule>) =>
    request<Rule>(`/api/clients/${clientId}/flows/${flowId}/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    }),
  deleteRule: (clientId: string, flowId: string, ruleId: string) =>
    request<void>(`/api/clients/${clientId}/flows/${flowId}/rules/${ruleId}`, { method: 'DELETE' }),

  // ---------- Executions (scoped to one flow) ----------
  listExecutions: (clientId: string, flowId: string, status?: string) =>
    request<ExecutionSummary[]>(
      `/api/clients/${clientId}/flows/${flowId}/executions${status ? `?status=${status}` : ''}`,
    ),
  getExecutionDetail: (clientId: string, flowId: string, executionId: string) =>
    request<ExecutionDetail>(`/api/clients/${clientId}/flows/${flowId}/executions/${executionId}`),

  // ---------- Manual test trigger - starts a real Step Functions execution ----------
  testFlow: (clientId: string, flowId: string, payload: Record<string, unknown>, orderId?: string) =>
    request<{ executionId: string; orderId: string }>(`/api/clients/${clientId}/flows/${flowId}/test`, {
      method: 'POST',
      body: JSON.stringify({ payload, orderId }),
    }),

  // ---------- Correction - resumes a paused (needs_review) execution ----------
  submitCorrection: (
    clientId: string,
    flowId: string,
    executionId: string,
    correction: { correctedPayload?: Record<string, unknown>; dismissedWarnings?: DismissedWarning[] },
  ) =>
    request<{ message: string }>(
      `/api/clients/${clientId}/flows/${flowId}/executions/${executionId}/correct`,
      { method: 'POST', body: JSON.stringify(correction) },
    ),
};
