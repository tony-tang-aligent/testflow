// apps/web/app/api/clients/[clientId]/flows/[flowId]/rules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../lib/internalApiClient';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; flowId: string }> },
) {
  const { clientId, flowId } = await params;
  const check = await requireClientAccess(clientId);
  if (!check.ok) return check.response;
  const rules = await callFlowEngine(`/tenants/${clientId}/flows/${flowId}/rules`);
  return NextResponse.json(rules);
}
