// web/lib/fieldTree.ts
//
// Foundation for every picker in the rebuilt UX: given a real sample payload,
// build a browsable tree of its actual fields so nobody ever types a raw
// dot-path from memory. This mirrors what Zapier does with a test-step sample
// and what Shopify Flow does by constraining variables to the trigger's declared
// schema - except our "schema" is just whatever JSON the person pasted in once.

export type FieldKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface FieldNode {
  path: string; // dot-path from the tree's root, e.g. 'lineItems.unitPrice' (root itself is '$')
  label: string; // humanized key, e.g. "Unit price"
  kind: FieldKind;
  preview: string; // short display value, e.g. '12.5' or '"PO-1001"' or 'Array of 2'
  children?: FieldNode[];
}

/** "unitPrice" -> "Unit price", "po_number" -> "Po number" */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function kindOf(value: unknown): FieldKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'null';
}

function previewOf(value: unknown, kind: FieldKind): string {
  if (kind === 'array') return `Array of ${(value as unknown[]).length}`;
  if (kind === 'object') return 'Group of fields';
  if (kind === 'string') return `"${value}"`;
  if (kind === 'null') return '(empty)';
  return String(value);
}

/**
 * Builds a tree from a sample value. Arrays are represented by their first
 * element's shape (a repeating scope's rule pickers browse one example item,
 * not the whole array) - the array node itself stays selectable for "pick this
 * as a repeating group" (scope creation), and also exposes its item shape as
 * children for convenience when browsing in place.
 */
export function buildFieldTree(value: unknown, path = '$', label = 'Order'): FieldNode {
  const kind = kindOf(value);
  const node: FieldNode = { path, label, kind, preview: previewOf(value, kind) };

  if (kind === 'object') {
    node.children = Object.entries(value as Record<string, unknown>).map(([key, v]) =>
      buildFieldTree(v, path === '$' ? key : `${path}.${key}`, humanizeKey(key)),
    );
  } else if (kind === 'array') {
    const sample = (value as unknown[])[0];
    if (sample !== undefined) {
      const itemNode = buildFieldTree(sample, path, label);
      node.children = itemNode.children ?? [];
    }
  }

  return node;
}

/** Resolves a dot-path (or '$') against an object - mirrors the backend's getPath. */
export function getValueAtPath(obj: unknown, path: string): unknown {
  if (path === '$') return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Sets a value at a dot-path, mutating the object in place. Used by the
 * per-field correction UI to write a reviewer's fix into a payload copy at
 * exactly the spot a violation's correctablePath points to. Assumes the path
 * already exists (we're correcting an existing wrong value, not authoring new
 * structure) - doesn't create missing intermediate objects.
 */
export function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop();
  if (!last) return;
  let target: unknown = obj;
  for (const key of keys) {
    if (target == null || typeof target !== 'object') return;
    target = (target as Record<string, unknown>)[key];
  }
  if (target != null && typeof target === 'object') {
    (target as Record<string, unknown>)[last] = value;
  }
}

/** Convenience: label for a path by walking the tree, for display after selection. */
export function labelForPath(tree: FieldNode, path: string): string {
  if (tree.path === path) return tree.label;
  for (const child of tree.children ?? []) {
    const found = labelForPath(child, path);
    if (found) return found;
  }
  return path;
}
