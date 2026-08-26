#!/usr/bin/env node
// infra/bin/app.ts
//
// Loads infra/.env before anything else - the Azure AD values below need to
// come from somewhere persistent (a file you fill in once), not typed inline
// on every `cdk deploy` command, which is exactly what got skipped and
// produced the "provider details should not be empty" Cognito error. Safe to
// no-op if the file doesn't exist (e.g. on a CI runner that injects real env
// vars a different way).
import 'dotenv/config';
//
// Each client gets its own stack instantiation, same construct, different
// clientName/adapterId - this is the "per-client stack, shared code" deployment
// model confirmed during scoping.

import * as cdk from 'aws-cdk-lib';
import { OrderValidatorStack } from '../lib/order-validator-stack';
import { ApiStack } from '../lib/api-stack';
import { FlowBuilderStack } from '../lib/flow-builder-stack';
import { IdentityStack } from '../lib/identity-stack';

const app = new cdk.App();
const env = { region: 'ap-southeast-2' };

// TODO: replace with real per-client deploy config (CI parameter, config file, or
// eventually a row in the RDS company table once that exists).
const clientName = 'your-client-name';

const orderValidatorCore = new OrderValidatorStack(app, `OrderValidator-${clientName}`, {
  clientName,
  adapterId: 'mock', // or 'myob-advanced' once that adapter's implemented
  env,
});

new ApiStack(app, `OrderValidatorApi-${clientName}`, {
  clientName,
  ruleTable: orderValidatorCore.ruleTable,
  flowTable: orderValidatorCore.flowTable,
  summaryTable: orderValidatorCore.summaryTable,
  detailBucket: orderValidatorCore.detailBucket,
  stateMachine: orderValidatorCore.stateMachine,
  env,
});

// New canvas/compiler system (flow-compiler-spec.md) - a single stack for the
// whole platform, not per-client like OrderValidatorStack/ApiStack above,
// since document-type flows aren't scoped per agency client the same way.
new FlowBuilderStack(app, 'FlowBuilder', { env });

// The identity/org control plane (Cognito federated to Azure AD + Aurora).
// Azure AD app registration values are read from the environment at synth
// time (never hardcoded) - copy infra/.env.example to infra/.env and fill in
// AZURE_AD_CLIENT_ID/AZURE_AD_CLIENT_SECRET/AZURE_AD_ISSUER_URL there;
// dotenv (loaded above) picks them up automatically, no need to type them on
// the command line.
//
// Skips constructing this ONE stack (rather than throwing) when the values
// are missing - OrderValidatorStack/ApiStack/FlowBuilderStack have no
// dependency on Azure AD/Cognito/Aurora at all, and bin/app.ts always runs in
// full regardless of which single stack `cdk deploy` targets. Throwing here
// unconditionally previously meant even `cdk deploy FlowBuilder` (nothing to
// do with identity) would crash before CDK could build its stack tree at
// all. `cdk deploy IdentityStack` specifically will now just fail with a
// clear "stack not found" if these are missing, which is a clear enough
// signal on its own without taking every other stack down with it.
const requiredAzureAdVars = {
  AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
  AZURE_AD_ISSUER_URL: process.env.AZURE_AD_ISSUER_URL,
};
const missingAzureAdVars = Object.entries(requiredAzureAdVars)
  .filter(([, value]) => !value || value.trim() === '')
  .map(([key]) => key);

if (missingAzureAdVars.length > 0) {
  console.warn(
    `Skipping IdentityStack - missing ${missingAzureAdVars.join(', ')}. Set these in infra/.env ` +
      `(copy infra/.env.example first) once you have real Azure AD credentials. Every other stack ` +
      `deploys fine without this one.`,
  );
} else {
  new IdentityStack(app, 'IdentityStack', {
    azureAdClientId: process.env.AZURE_AD_CLIENT_ID!,
    azureAdClientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    azureAdIssuerUrl: process.env.AZURE_AD_ISSUER_URL!,
    deployedAppUrl: process.env.DEPLOYED_APP_URL,
    env,
  });
}

// Example second client, for illustration of the per-client pattern - duplicate this
// whole block (core stack + api stack) per additional client, with its own clientName:
//
// const nextClientName = 'next-client-name';
// const nextClientCore = new OrderValidatorStack(app, `OrderValidator-${nextClientName}`, {
//   clientName: nextClientName,
//   adapterId: 'mock',
//   env,
// });
// new ApiStack(app, `OrderValidatorApi-${nextClientName}`, {
//   clientName: nextClientName,
//   ruleTable: nextClientCore.ruleTable,
//   flowTable: nextClientCore.flowTable,
//   summaryTable: nextClientCore.summaryTable,
//   detailBucket: nextClientCore.detailBucket,
//   stateMachine: nextClientCore.stateMachine,
//   env,
// });
