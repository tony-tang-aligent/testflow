// apps/web/app/api/clients/[clientId]/flows/[flowId]/executions/[executionId]/correct/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../../../lib/internalApiClient';

export async function POST(
  req: NextRequest,
  { params }: { params: { clientId: string; flowId: string; executionId: string } },
) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const body = await req.text();
  const result = await callFlowEngine(
    `/tenants/${params.clientId}/flows/${params.flowId}/executions/${params.executionId}/correct`,
    { method: 'POST', body },
  );
  return NextResponse.json(result);
}
