// apps/web/app/api/clients/[clientId]/flows/[flowId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../lib/internalApiClient';

type Params = { params: { clientId: string; flowId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const flow = await callFlowEngine(`/tenants/${params.clientId}/flows/${params.flowId}`);
  return NextResponse.json(flow);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const body = await req.text();
  const flow = await callFlowEngine(`/tenants/${params.clientId}/flows/${params.flowId}`, {
    method: 'PUT',
    body,
  });
  return NextResponse.json(flow);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  await callFlowEngine(`/tenants/${params.clientId}/flows/${params.flowId}`, { method: 'DELETE' });
  return new NextResponse(null, { status: 204 });
}
