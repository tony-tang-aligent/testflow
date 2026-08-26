# Deployment guide

Two independent deploys: the CDK stacks (backend) first, then Amplify Hosting
(frontend) — the frontend needs the API URL the backend produces, so order matters.

**Before you start:** this scaffold has no authorizer on the API (see README).
Don't deploy this somewhere publicly reachable with real client data yet — deploy
into a private/test AWS account first, or at minimum restrict the API Gateway
with a resource policy / WAF IP allowlist until Cognito is wired in.

## Part 1 — Deploy the CDK stacks

### Prerequisites
- AWS CLI configured with credentials for the target account (`aws configure` or an SSO profile)
- Node.js 20+
- Either **Docker running locally**, or `esbuild` installed as a dev dependency
  (already added to `infra/package.json`) — `NodejsFunction` needs one or the other
  to bundle the Lambda code.

### Steps

```bash
cd infra
npm install

# One-time per account/region - provisions the CDK's own deploy infra (S3 bucket, IAM roles)
npx cdk bootstrap aws://<ACCOUNT_ID>/ap-southeast-2

# Review what will actually be created before deploying
npx cdk diff --all

# Deploy both stacks - CDK resolves the dependency order automatically since
# ApiStack takes OrderValidatorStack's table/bucket references as props
npx cdk deploy --all
```

For the **first deploy**, switch `infra/bin/app.ts`'s `adapterId` to `'mock'`
instead of `'myob-advanced'` — this lets you exercise the whole state machine
end-to-end against the in-memory fake ERP before the real MYOB adapter is finished.

### After deploy

`cdk deploy --all` prints an `ApiUrl` output from `ApiStack` — copy it, you'll need
it for the frontend. It looks like:

```
OrderValidatorApi-Modelflight.ApiUrl = https://abc123xyz.execute-api.ap-southeast-2.amazonaws.com
```

### Seed a FlowDefinition (no UI-driven onboarding exists yet)

Since there's no authenticated admin flow yet, seed the first tenant's
`FlowDefinition` directly:

```bash
aws dynamodb put-item \
  --table-name modelflight-FlowDefinition \
  --item '{
    "tenantId": {"S": "modelflight"},
    "version": {"N": "1"},
    "adapterId": {"S": "mock"},
    "executionMode": {"S": "collectAll"},
    "scopes": {"L": [
      {"M": {"scopeId": {"S": "order"}, "itemsPath": {"S": "$"}}},
      {"M": {"scopeId": {"S": "lineItem"}, "itemsPath": {"S": "lineItems"}}}
    ]}
  }'
```

Add a rule or two the same way against `modelflight-RuleStore`, or use the API
directly with `curl` (it's unauthenticated right now, so this works without a token):

```bash
curl -X PUT "$API_URL/tenants/modelflight/rules/price-match" \
  -H 'content-type: application/json' \
  -d '{
    "active": true,
    "scopeId": "lineItem",
    "kind": "validation",
    "severity": "block",
    "message": "Line price does not match PO price",
    "evaluate": {
      "comparator": "equals",
      "left": {"source": "payload", "path": "unitPrice"},
      "right": {"source": "reference", "refType": "purchaseOrder", "refKey": "poNumber", "refLineKey": "sku", "path": "price"}
    }
  }'
```

### Triggering an execution

Nothing invokes the state machine yet — no EventBridge rule or API route starts
an execution (that's the "input/output, don't worry about it yet" boundary from
scoping). For manual testing, start an execution directly:

```bash
aws stepfunctions start-execution \
  --state-machine-arn <arn from CloudFormation output or console> \
  --input '{
    "tenantId": "modelflight",
    "executionId": "exec-001",
    "orderId": "ORDER-123",
    "payload": { "lineItems": [{"sku": "SKU-A", "unitPrice": 12.0, "poNumber": "PO-1001"}] }
  }'
```

## Part 2 — Deploy the frontend to Amplify Hosting

The repo is a monorepo (`infra/`, `api/`, `web/` as siblings) — Amplify needs to
know the Next.js app root is `web/`. The `amplify.yml` at the repo root already
encodes this.

### Steps

1. Push this repo to GitHub/GitLab/Bitbucket/CodeCommit (Amplify Hosting's
   compute-backed Next.js support requires a connected git repo — plain
   drag-and-drop deploy only works for fully static sites).
2. In the **Amplify console** → *New app* → *Host web app* → connect the repo and branch.
3. When prompted for build settings, Amplify should detect the root `amplify.yml`
   and its monorepo `appRoot: web` setting. If it instead offers to autodetect
   Next.js at the repo root, **decline autodetect and confirm it's using the
   checked-in `amplify.yml`** — otherwise it'll try to build from the repo root
   and fail (there's no `package.json` at the root by design).
4. Under **App settings → Environment variables**, add:
   ```
   NEXT_PUBLIC_API_BASE_URL = <the ApiUrl from Part 1>
   ```
   This is read by `web/lib/api.ts` at build time — any change requires a redeploy,
   not just a page refresh, since it's a `NEXT_PUBLIC_*` var baked in at build.
5. Trigger the build (push to the connected branch, or "Run build" in console).
   Amplify provisions the Next.js SSR compute automatically — no extra config
   needed for that part.
6. Optional: attach a custom domain under **App settings → Domain management**.

### Verifying end-to-end

Once both are deployed: open the Amplify app URL → **Executions** should show
whatever you started manually via `start-execution` above (once `aggregate` has
run and written the DynamoDB summary) → clicking into it should lazy-load the S3
detail. **Rules** and **Flow definition** pages will work against the live API
immediately, since those routes are already wired — just unauthenticated.

## When auth/RDS land later

Two things change on the deploy side, not covered here since they're out of
scope for this pass:
- Amplify Hosting gets an **Amplify Auth (Cognito)** resource attached, and the
  frontend needs `aws-amplify` installed + `Amplify.configure(...)` with the
  User Pool details — currently `web/lib/api.ts` has no auth SDK dependency at all.
- The API stack's `HttpApi` needs a `defaultAuthorizer` (`HttpJwtAuthorizer`)
  pointed at the Cognito User Pool, and `infra/api/lib/authContext.ts` needs to actually
  read `event.requestContext.authorizer.jwt.claims` instead of returning a stub.
