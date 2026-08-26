# Order validation engine — core scaffold

Implements the design scoped in conversation: a config-driven, per-client-deployed
order validation engine, blending "condition" and "action" into a single
resolve-then-evaluate rule primitive, running on a static Step Functions state
machine over a normalized scope/item model.

This scaffold implements **everything except user/session/company identity** —
every place that needs that is marked `// TODO(auth)` or `// TODO(RDS)`. Nothing
here should be deployed to a real AWS account as-is: the API layer has no
authorizer attached yet, so every route is open.

Note: the API CRUD handlers live under `infra/api/`, not a top-level `api/`
directory — `NodejsFunction` requires every bundled Lambda entry file to sit
under one shared project root, so the API handlers moved in alongside the
execution Lambdas rather than staying a sibling of `infra/`.

## Structure

```
infra/                          CDK app - one stack per client
  lib/
    order-validator-stack.ts    DynamoDB tables, S3 bucket, Lambdas, state machine
    api-stack.ts                API Gateway + CRUD Lambdas (no authorizer yet)
  lambda/
    shared/
      types.ts                  Resolver / Evaluate / Rule / FlowDefinition / ValidationResult
      ruleEvaluator.ts          resolve + evaluate core logic
      erpAdapter.ts             ErpAdapter interface
      adapterRegistry.ts        adapterId -> ErpAdapter instance
      adapters/
        mockAdapter.ts          in-memory fake, for local dev/testing
        myobAdapter.ts          MYOB Advanced adapter (stubbed, TODO: port existing OData client)
      ddb.ts / s3.ts            data access helpers
    loadFlowDefinition/         state 1: read tenant config + active rules
    resolveScopes/              state 2: normalize payload, pre-fetch ERP references
    evaluateRules/               state 3 (runs inside Map): resolve+evaluate a batch of items
    aggregate/                  state 4: merge results, write DynamoDB summary + S3 detail
  api/
    handlers/                   rules.ts / flowDefinitions.ts / executions.ts (CRUD Lambdas)
    lib/authContext.ts          auth/tenant resolution — currently a stub, see TODOs
  bin/app.ts                    stack instantiation, one per client

web/                            Next.js app (deploy to Amplify Hosting)
  app/
    canvas/                      drag-and-drop visual builder (ReactFlow) - primary authoring UI
    rules/                       rule list + form editor (still works standalone)
    executions/                  execution list (DynamoDB) + detail (lazy S3 fetch)
  components/
    nodes/
      ScopeNode.tsx               canvas node representing a ScopeDefinition
      RuleNode.tsx                canvas node representing a Rule (derivation or validation)
    NodePalette.tsx               drag source for creating new scope/rule nodes
    Modal.tsx                     generic overlay used by the canvas's node editors
    ResolverEditor.tsx           reusable "how to get a value" sub-form
    RuleForm.tsx                 full rule editor composing two ResolverEditors + comparator -
                                  reused unchanged inside the canvas's rule-edit modal
    ExecutionTable.tsx / StatusBadge.tsx
  lib/
    api.ts                       API client — TODO(auth): attach Cognito token
    types.ts                     FE copy of the shared domain types
```

## Deployment model

Per the confirmed design: **one CDK stack instantiation per client**, same code,
different `clientName`/`adapterId` parameters (see `infra/bin/app.ts`). All stacks
can live in the same AWS account. Multi-region DR (if "global" turns out to mean
failover rather than latency) is a matter of adding DynamoDB Global Tables and
deploying the stack a second time into another region — not modeled yet, flagged
inline in `order-validator-stack.ts`.

## What's deliberately not built yet

Everything below is a real gap, not an oversight — flagged so it doesn't get lost:

- **Auth (Cognito)**: no User Pool, no API Gateway authorizer. `infra/api/lib/authContext.ts`
  is a stub that always returns a hardcoded tenant. Every API route is open right now.
- **RDS identity/org control plane**: no `companies` / `users` / `user_company_roles`
  tables, no Aurora Serverless v2 instance. `tenantId` is currently just a path
  parameter with no verification that the caller is authorized for it.
- **MYOB Advanced adapter**: interface + method stubs are in place
  (`infra/lambda/shared/adapters/myobAdapter.ts`), but the actual OData calls throw
  `Not implemented` — port the existing OData client/auth/credential handling from
  the MYOB Advanced sync services repo rather than rewriting it.
- **`appliesWhenMatches`**: currently always returns `true` — swap in the real
  `json-logic-js` evaluation (already a dependency in `kazilo-execution-engine`,
  same convention: `{ var: path }`).
- **BatchGetItem for rule loads**: `ddb.ts#getActiveRules` loops individual `GetCommand`
  calls for clarity; swap for a real `BatchGetCommand` if rule counts per tenant grow.

## Canvas UX — guided builder, field-picker driven

`/canvas` was rebuilt around one principle: **nobody types a raw path or JSON
Logic to author a rule.** This follows how Zapier and Shopify Flow actually solve
the same problem — every value comes from clicking a real example, not from
knowing the payload's shape or the engine's internal vocabulary.

- **Onboarding gate**: the first time a tenant opens `/canvas`, they must paste
  one real example order payload before anything else is authorable. Everything
  downstream browses this example instead of asking for typed field paths.
  Stored as `FlowDefinition.samplePayload` — an authoring aid only, never read by
  the execution engine itself.
- **Guided insertion, not free-form dragging**: nodes are still repositionable by
  dragging (visual arrangement), but *creation* only happens via a `+` — the
  Start node's `+` adds a "repeat for each…" group, a group's `+` adds a rule to
  it. This mirrors Zapier/Shopify Flow's real interaction model despite their own
  "drag and drop" branding — neither actually lets you drop a disconnected node.
- **Field picker (`components/PayloadFieldPicker.tsx` / `FieldPickerButton.tsx`)**:
  browses the sample payload as an expandable tree; clicking a field selects its
  path. Two modes — `leaf` (pick a value to compare) and `array` (pick what a
  group repeats over).
- **Sentence-style rule editor (`components/SentenceRuleEditor.tsx` /
  `ResolverSentencePicker.tsx`)**: a rule reads as "Get **[field]** … is at most …
  **[PO price, looked up by PO number]**." Falls back to the raw `RuleForm` (typed
  paths, JSON Logic) via an "Advanced" toggle for cases the sentence builder
  doesn't cover yet — historical/uniqueness resolvers, hand-written gates.
- **Terminology**: internal names never surface. "Scope" → "Repeat for
  each…", `severity: block/warn` → "Stop the order" / "Just flag it", `writesTo`
  → "Remember this as", `appliesWhen` → "Only run this if…".

`/rules` (the original raw-form page) still exists and reads/writes the same
API, as the "advanced" surface for cases the sentence builder doesn't cover yet —
useful for bulk edits or historical resolvers, not the primary authoring path.
The equivalent raw form for `FlowDefinition` (`/flow`) was removed entirely once
the canvas's guided scope creation covered everything it did, with no typing
required — there was no case left where the raw form was better.

## Local dev without a real ERP

Set a tenant's `FlowDefinition.adapterId` to `"mock"` to run the whole engine
against `MockAdapter` (in-memory fake PO data) — useful for exercising the state
machine end-to-end before the MYOB adapter is finished.
