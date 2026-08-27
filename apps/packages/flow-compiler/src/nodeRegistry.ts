// packages/flow-compiler/src/nodeRegistry.ts
//
// A flat map of node type -> definition. Adding a node type (including a
// trusted partner's marketplace node, per spec §8) means adding one entry
// here - the compiler and canvas both read this registry generically, never
// special-casing a node type by name outside of it.

import { NodeTypeDefinition } from './types';

export const NODE_TYPE_REGISTRY: Record<string, NodeTypeDefinition> = {
  documentInput: {
    type: 'documentInput',
    icon: 'bolt',
    category: 'control',
    label: 'Document Input',
    description: 'Receives the extracted document JSON. Every flow starts here.',
    canHaveOutput: true,
    branches: false,
    configFields: [],
  },

  fieldValidator: {
    type: 'fieldValidator',
    icon: 'rule',
    category: 'check',
    label: 'Field Validator',
    description: 'Checks one field against a rule (exists, non-empty, comparison, regex).',
    canHaveOutput: true,
    branches: true,
    configFields: [
      { key: 'fieldPath', label: 'Field path', kind: 'fieldPicker', placeholder: 'e.g. lineItems[0].price' },
      {
        key: 'rule',
        label: 'Rule',
        kind: 'select',
        options: ['mustExist', 'nonEmpty', 'greaterThan', 'lessThan', 'matchesRegex'],
      },
      { key: 'compareValue', label: 'Compare value', kind: 'fieldPicker', placeholder: 'e.g. 0, a regex, or another field' },
    ],
  },

  computedCheck: {
    type: 'computedCheck',
    icon: 'calculate',
    category: 'check',
    label: 'Computed Check',
    description: 'Compares a calculated value (e.g. quantity × price) against a field.',
    canHaveOutput: true,
    branches: true,
    configFields: [
      { key: 'expression', label: 'Expression', kind: 'text', placeholder: 'e.g. quantity * unitPrice' },
      { key: 'comparedTo', label: 'Compared to field', kind: 'fieldPicker', placeholder: 'e.g. lineTotal' },
    ],
  },

  repeatForEach: {
    type: 'repeatForEach',
    icon: 'repeat',
    category: 'control',
    label: 'Repeat For Each',
    description: 'Runs a nested chain once per array item (e.g. every line item). See spec §6.',
    canHaveOutput: true,
    branches: false,
    configFields: [{ key: 'arrayPath', label: 'Array field', kind: 'fieldPicker', placeholder: 'e.g. payload.lineItems' }],
  },

  emailAlert: {
    type: 'emailAlert',
    icon: 'mail',
    category: 'action',
    label: 'Email Alert',
    description: 'Sends a templated email. Terminal - nothing runs after this.',
    canHaveOutput: false,
    branches: false,
    configFields: [
      { key: 'recipients', label: 'Recipients', kind: 'text', placeholder: 'someone@company.com' },
      { key: 'subject', label: 'Subject', kind: 'text', placeholder: 'e.g. Action required: {{poNumber}}' },
      { key: 'body', label: 'Body', kind: 'textarea', placeholder: 'Use {{field}} for dynamic values.' },
    ],
  },

  slackAlert: {
    type: 'slackAlert',
    icon: 'chat',
    category: 'action',
    label: 'Slack Message',
    description: 'Posts to a Slack channel. Terminal - nothing runs after this.',
    canHaveOutput: false,
    branches: false,
    configFields: [
      { key: 'channel', label: 'Channel', kind: 'text', placeholder: '#order-issues' },
      { key: 'message', label: 'Message', kind: 'textarea', placeholder: 'Use {{field}} for dynamic values.' },
    ],
  },

  httpCall: {
    type: 'httpCall',
    icon: 'http',
    category: 'action',
    label: 'HTTP Request',
    description: 'Calls an external API with a mapped request - method, auth, headers, and body all configurable, and testable before you publish.',
    // Unlike every other action node, this one CAN have output - its
    // response is captured into $.actionResults.<nodeId> so a later check
    // can compare a field from it against the original payload. Every other
    // action (email/Slack/Lambda invoke) stays genuinely terminal - "we
    // don't care what's going out" still holds for those, this is the one
    // exception where the response is the whole point of calling it.
    canHaveOutput: true,
    branches: false,
    configFields: [
      { key: 'method', label: 'Method', kind: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/orders (supports {{payload.x}})' },
      {
        key: 'authType',
        label: 'Authentication',
        kind: 'select',
        options: ['None', 'API Key Header', 'Bearer Token', 'Basic Auth'],
      },
      {
        key: 'authHeaderName',
        label: 'API key header name',
        kind: 'text',
        placeholder: 'e.g. X-API-Key (only used for API Key Header)',
      },
      {
        key: 'authSecretName',
        label: 'Secret name',
        kind: 'text',
        placeholder: 'Name of the secret in Secrets Manager (see security note)',
      },
      { key: 'headers', label: 'Headers', kind: 'keyValueMapper' },
      { key: 'body', label: 'Body', kind: 'keyValueMapper' },
    ],
  },

  lambdaInvoke: {
    type: 'lambdaInvoke',
    icon: 'functions',
    category: 'action',
    label: 'Call Lambda',
    description: 'Invokes another Lambda function. Terminal - nothing runs after this.',
    canHaveOutput: false,
    branches: false,
    configFields: [
      { key: 'functionArn', label: 'Function ARN', kind: 'text', placeholder: 'arn:aws:lambda:...' },
    ],
  },

  errorAggregator: {
    type: 'errorAggregator',
    icon: 'call_merge',
    category: 'aggregation',
    label: 'Error Aggregator',
    description: 'Collects violations from all checks into one result. The one shared merge point (spec §5).',
    canHaveOutput: true,
    branches: false,
    configFields: [],
  },

  workflowResult: {
    type: 'workflowResult',
    icon: 'verified',
    category: 'output',
    label: 'Workflow Result',
    description: 'Ends the flow and returns the result to Portalink.',
    canHaveOutput: false,
    branches: false,
    configFields: [
      { key: 'returnResult', label: 'Return result', kind: 'select', options: ['passed', 'failed'] },
    ],
  },

  // Example of what a trusted partner's marketplace node actually looks like
  // (spec §8) - not a hypothetical, this is the real, working mechanism.
  // Uncomment and point executorArn at a real deployed Lambda to register one:
  //
  // 'partner-acme-shipping-lookup': {
  //   type: 'partner-acme-shipping-lookup',
  //   category: 'action',
  //   label: 'Acme Shipping Lookup',
  //   description: "Looks up shipping status via Acme's API.",
  //   canHaveOutput: false,
  //   branches: false,
  //   configFields: [{ key: 'trackingNumber', label: 'Tracking number', kind: 'fieldPicker' }],
  //   executorArn: 'arn:aws:lambda:ap-southeast-2:123456789012:function:acme-shipping-lookup',
  // },
};

export function getNodeType(type: string): NodeTypeDefinition {
  const def = NODE_TYPE_REGISTRY[type];
  if (!def) throw new Error(`Unknown node type: ${type}`);
  return def;
}
