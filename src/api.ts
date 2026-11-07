import type { DraftResult, JobKind, JobView, OutlineItem, ReviewResult, StructureResult, Verification, VerifyEntry } from '../shared/types.ts';

export interface ApiError { status: number; error: string; message: string; fix?: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  } catch {
    throw { status: 0, error: 'offline', message: 'The local Haunted Ink server did not answer. Check that `npm start` is still running.' } satisfies ApiError;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, error: body.error ?? 'error', message: body.message ?? `The server answered HTTP ${res.status}.`, fix: body.fix } satisfies ApiError;
  return body as T;
}

export interface HealthInfo { kiro: 'ready' | 'missing' | 'logged_out' | 'unknown'; version?: string; detail?: string }

export const getHealth = () => call<HealthInfo>('/api/health');
export const verifyDois = (references: VerifyEntry[], force: boolean) =>
  call<{ results: Record<string, Verification> }>('/api/citations/verify', { method: 'POST', body: JSON.stringify({ references, force }) });
export const submitRevision = (body: { paragraph: string; heading?: string; intent: string }) =>
  call<{ id: string; position: number }>('/api/revisions', { method: 'POST', body: JSON.stringify(body) });
export const getRevision = (id: string) => call<JobView>(`/api/revisions/${id}`);
export const cancelRevision = (id: string) => call<{ ok: boolean }>(`/api/revisions/${id}`, { method: 'DELETE', body: '{}' });

// ---- editorial jobs: one shared queue, one route per kind ----
const PATH: Record<JobKind, string> = { revision: '/api/revisions', structure: '/api/outline', draft: '/api/drafts', review: '/api/reviews' };

export interface JobBodies {
  structure: { notes: string; knownKeys: string[] };
  draft: { item: { heading: string; brief: string; evidence: { claim: string; status: 'needed' | 'cited'; keys: string[] }[] }; notes: string; knownKeys: string[]; before: string; after: string };
  review: { blockId: string; paragraph: string; heading?: string };
}
export interface JobResults { structure: StructureResult; draft: DraftResult; review: ReviewResult }

export const submitJob = <K extends keyof JobBodies>(kind: K, body: JobBodies[K]) =>
  call<{ id: string; position: number }>(PATH[kind], { method: 'POST', body: JSON.stringify(body) });
export const getJob = <K extends keyof JobResults>(kind: K, id: string) => call<JobView<JobResults[K]>>(`${PATH[kind]}/${id}`);
export const cancelJob = (kind: JobKind, id: string) => call<{ ok: boolean }>(`${PATH[kind]}/${id}`, { method: 'DELETE', body: '{}' });
export type { OutlineItem };
