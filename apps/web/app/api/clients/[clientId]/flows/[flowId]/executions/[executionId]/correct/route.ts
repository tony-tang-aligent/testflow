// apps/web/app/api/clients/[clientId]/flows/[flowId]/executions/[executionId]/correct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../../../lib/internalApiClient';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; flowId: string; executionId: string }> },
) {
  const { clientId, flowId, executionId } = await params;
  const check = await requireClientAccess(clientId);
  if (!check.ok) return check.response;
  const body = await req.text();
  const result = await callFlowEngine(
    `/tenants/${clientId}/flows/${flowId}/executions/${executionId}/correct`,
    { method: 'POST', body },
  );
  return NextResponse.json(result);
}
