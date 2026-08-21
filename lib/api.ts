// web/lib/api.ts
//
// TODO(auth): every call below needs the current user's Cognito ID token attached
// (Authorization: Bearer <token>). Currently unauthenticated - fine for local dev
// against the API stack before Cognito is wired up, not for anything real.
// TODO(RDS): tenantId is hardcoded below. Once auth exists, resolve it from the
// signed-in user's session (their authorized company) instead of a constant.

import { Rule, FlowDefinition, ExecutionSummary, ExecutionDetail, DismissedWarning } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

// TODO(RDS): replace with the tenantId resolved from the authenticated session.
const CURRENT_TENANT_ID = 'TODO-current-tenant';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // TODO(auth): Authorization: `Bearer ${await getIdToken()}`
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ---------- Flows (a tenant can have several - e.g. "AP invoice validation", "PO order validation") ----------
  listFlows: () => request<FlowDefinition[]>(`/tenants/${CURRENT_TENANT_ID}/flows`),
  createFlow: (name: string) =>
    request<FlowDefinition>(`/tenants/${CURRENT_TENANT_ID}/flows`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  getFlowDefinition: (flowId: string) =>
    request<FlowDefinition>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}`),
  saveFlowDefinition: (flowId: string, flow: Partial<FlowDefinition>) =>
    request<FlowDefinition>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}`, {
      method: 'PUT',
      body: JSON.stringify(flow),
    }),
  deleteFlow: (flowId: string) =>
    request<void>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}`, { method: 'DELETE' }),

  // ---------- Rules (scoped to one flow) ----------
  listRules: (flowId: string) => request<Rule[]>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/rules`),
  getRule: (flowId: string, ruleId: string) =>
    request<Rule>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/rules/${ruleId}`),
  saveRule: (flowId: string, ruleId: string, rule: Partial<Rule>) =>
    request<Rule>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    }),
  deleteRule: (flowId: string, ruleId: string) =>
    request<void>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/rules/${ruleId}`, { method: 'DELETE' }),

  // ---------- Executions (scoped to one flow) ----------
  listExecutions: (flowId: string, status?: string) =>
    request<ExecutionSummary[]>(
      `/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/executions${status ? `?status=${status}` : ''}`,
    ),
  getExecutionDetail: (flowId: string, executionId: string) =>
    request<ExecutionDetail>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/executions/${executionId}`),

  // ---------- Manual test trigger - starts a real Step Functions execution ----------
  testFlow: (flowId: string, payload: Record<string, unknown>, orderId?: string) =>
    request<{ executionId: string; orderId: string }>(`/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/test`, {
      method: 'POST',
      body: JSON.stringify({ payload, orderId }),
    }),

  // ---------- Correction - resumes a paused (needs_review) execution ----------
  submitCorrection: (
    flowId: string,
    executionId: string,
    correction: { correctedPayload?: Record<string, unknown>; dismissedWarnings?: DismissedWarning[] },
  ) =>
    request<{ message: string }>(
      `/tenants/${CURRENT_TENANT_ID}/flows/${flowId}/executions/${executionId}/correct`,
      { method: 'POST', body: JSON.stringify(correction) },
    ),
};
