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
    category: 'control',
    label: 'Document Input',
    description: 'Receives the extracted document JSON. Every flow starts here.',
    canHaveOutput: true,
    branches: false,
    configFields: [],
  },

  fieldValidator: {
    type: 'fieldValidator',
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
      { key: 'compareValue', label: 'Compare value', kind: 'text', placeholder: 'e.g. 0 or a regex' },
    ],
  },

  computedCheck: {
    type: 'computedCheck',
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
    category: 'control',
    label: 'Repeat For Each',
    description: 'Runs a nested chain once per array item (e.g. every line item). See spec §6.',
    canHaveOutput: true,
    branches: false,
    configFields: [{ key: 'arrayPath', label: 'Array field', kind: 'fieldPicker', placeholder: 'e.g. payload.lineItems' }],
  },

  emailAlert: {
    type: 'emailAlert',
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
    category: 'action',
    label: 'HTTP Request',
    description: 'Calls an external API. Terminal - nothing runs after this.',
    canHaveOutput: false,
    branches: false,
    configFields: [
      { key: 'method', label: 'Method', kind: 'select', options: ['GET', 'POST', 'PUT'] },
      { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/notify' },
      { key: 'body', label: 'Body', kind: 'textarea', placeholder: 'JSON body template' },
    ],
  },

  lambdaInvoke: {
    type: 'lambdaInvoke',
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
    category: 'aggregation',
    label: 'Error Aggregator',
    description: 'Collects violations from all checks into one result. The one shared merge point (spec §5).',
    canHaveOutput: true,
    branches: false,
    configFields: [],
  },

  workflowResult: {
    type: 'workflowResult',
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