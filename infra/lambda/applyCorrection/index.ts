// infra/lambda/applyCorrection/index.ts
//
// Runs right after AwaitCorrection resumes (a human called /correct). Merges
// the corrected payload into `input` and accumulates newly-dismissed warnings
// on top of whatever was already dismissed in earlier rounds, then hands
// everything back in exactly the shape resolveScopes expects (LoadFlowDefinitionOutput)
// so the state machine can loop straight back into it. Deliberately does NOT
// re-fetch flowDefinition/rules - every round re-validates against the exact
// rule versions the review started with, for reproducibility (a rule edited
// mid-review shouldn't silently change what's being checked partway through).

import { ExecutionInput, FlowDefinition, Rule, DismissedWarning } from '../shared/types';

export interface ApplyCorrectionInput {
  input: ExecutionInput;
  flowDefinition: FlowDefinition;
  scopes: Array<{
    scopeId: string;
    itemsPath: string;
    derivationRules: Rule[];
    validationRules: Rule[];
  }>;
  dismissedWarnings: DismissedWarning[]; // accumulated so far, across all prior rounds
  correction: {
    correctedPayload?: Record<string, unknown>;
    dismissedWarnings?: DismissedWarning[]; // newly submitted this round
  };
}

export interface ApplyCorrectionOutput {
  input: ExecutionInput;
  flowDefinition: FlowDefinition;
  scopes: ApplyCorrectionInput['scopes'];
  dismissedWarnings: DismissedWarning[];
}

export const handler = async (evt: ApplyCorrectionInput): Promise<ApplyCorrectionOutput> => {
  const newlyDismissed = evt.correction.dismissedWarnings ?? [];
  const merged = [...evt.dismissedWarnings];
  for (const d of newlyDismissed) {
    if (!merged.some((m) => m.ruleId === d.ruleId && m.itemId === d.itemId)) merged.push(d);
  }

  return {
    input: {
      ...evt.input,
      payload: evt.correction.correctedPayload ?? evt.input.payload,
    },
    flowDefinition: evt.flowDefinition,
    scopes: evt.scopes,
    dismissedWarnings: merged,
  };
};
