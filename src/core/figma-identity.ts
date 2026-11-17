// Native IDs can contain semicolons (instance descendants), which are not Deck IDs.
export function figmaId(kind: string, value: string, linked?: string): string {
  if (linked && /^[a-zA-Z0-9_.:-]{1,120}$/.test(linked)) return linked;
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `figma-${kind}-${value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 75)}-${(hash >>> 0).toString(36)}`;
}
