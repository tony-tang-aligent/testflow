// apps/web/app/api/clients/[clientId]/flows/[flowId]/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../lib/internalApiClient';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; flowId: string }> },
) {
  const { clientId, flowId } = await params;
  const check = await requireClientAccess(clientId);
  if (!check.ok) return check.response;
  const body = await req.text();
  const result = await callFlowEngine(`/tenants/${clientId}/flows/${flowId}/test`, {
    method: 'POST',
    body,
  });
  return NextResponse.json(result, { status: 202 });
}
