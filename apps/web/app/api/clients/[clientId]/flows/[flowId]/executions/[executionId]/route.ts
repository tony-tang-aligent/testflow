// apps/web/app/api/clients/[clientId]/flows/[flowId]/executions/[executionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../../lib/internalApiClient';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; flowId: string; executionId: string }> },
) {
  const { clientId, flowId, executionId } = await params;
  const check = await requireClientAccess(clientId);
  if (!check.ok) return check.response;
  const detail = await callFlowEngine(`/tenants/${clientId}/flows/${flowId}/executions/${executionId}`);
  return NextResponse.json(detail);
}
