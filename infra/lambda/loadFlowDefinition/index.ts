// infra/lambda/loadFlowDefinition/index.ts
//
// First state in the state machine. Reads this tenant's FlowDefinition (which scopes
// are active, which rule IDs apply, which ERP adapter to use) plus the active rule
// set per scope. Splits derivation vs validation rules per scope for the next steps.

import { getFlowDefinition, getAllActiveRulesForScope } from '../shared/ddb';
import { ExecutionInput, FlowDefinition, Rule, DismissedWarning } from '../shared/types';

export interface LoadFlowDefinitionOutput {
  input: ExecutionInput;
  flowDefinition: FlowDefinition;
  scopes: Array<{
    scopeId: string;
    itemsPath: string;
    derivationRules: Rule[];
    validationRules: Rule[];
  }>;
  // Initialized empty here so it exists in state from round 1 onward - every
  // later state (resolveScopes, applyCorrection) just passes it through
  // unmodified except applyCorrection, which is the only place new dismissals
  // get merged in.
  dismissedWarnings: DismissedWarning[];
}

export const handler = async (input: ExecutionInput): Promise<LoadFlowDefinitionOutput> => {
  const flowDefinition = await getFlowDefinition(input.tenantId, input.flowId);
  if (!flowDefinition) {
    throw new Error(`No FlowDefinition found for tenant ${input.tenantId}, flow ${input.flowId}`);
  }

  const scopes = await Promise.all(
    flowDefinition.scopes.map(async (scope) => {
      const allRules = await getAllActiveRulesForScope(input.tenantId, input.flowId, scope.scopeId);
      return {
        scopeId: scope.scopeId,
        itemsPath: scope.itemsPath,
        derivationRules: allRules.filter((r) => r.kind === 'derivation'),
        validationRules: allRules.filter((r) => r.kind === 'validation'),
      };
    }),
  );

  return { input, flowDefinition, scopes, dismissedWarnings: [] };
};
