// apps/web/app/api/clients/[clientId]/flows/[flowId]/rules/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess } from '../../../../../../../lib/requireClientAccess';
import { callFlowEngine } from '../../../../../../../lib/internalApiClient';

export async function GET(
  _req: NextRequest,
  { params }: { params: { clientId: string; flowId: string } },
) {
  const check = await requireClientAccess(params.clientId);
  if (!check.ok) return check.response;
  const rules = await callFlowEngine(`/tenants/${params.clientId}/flows/${params.flowId}/rules`);
  return NextResponse.json(rules);
}
