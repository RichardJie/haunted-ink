let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}${counter.toString(36)}`;
}
