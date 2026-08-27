// apps/web/app/api/clients/[clientId]/flows/[flowId]/executions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../lib/internalApiClient';

export async function GET(
  req: NextRequest,
  { params }: { params: { clientId: string; flowId: string } },
) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const status = req.nextUrl.searchParams.get('status');
  const qs = status ? `?status=${status}` : '';
  const executions = await callFlowEngine(
    `/tenants/${params.clientId}/flows/${params.flowId}/executions${qs}`,
  );
  return NextResponse.json(executions);
}
