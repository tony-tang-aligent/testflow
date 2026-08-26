// apps/web/app/api/clients/[clientId]/flows/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../lib/internalApiClient';

export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const flows = await callFlowEngine(`/tenants/${params.clientId}/flows`);
  return NextResponse.json(flows);
}

export async function POST(req: NextRequest, { params }: { params: { clientId: string } }) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const body = await req.text();
  const flow = await callFlowEngine(`/tenants/${params.clientId}/flows`, { method: 'POST', body });
  return NextResponse.json(flow, { status: 201 });
}
