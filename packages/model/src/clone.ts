/** Deep copy of plain JSON data (project, layout, defaults). Environment-neutral, unlike structuredClone. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
