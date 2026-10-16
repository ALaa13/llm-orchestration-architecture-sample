import type { TaskType } from '../interpretation/interpretation.types';

export type RetrievalPolicy =
  | { action: 'retrieve'; reason: 'task_default' }
  | { action: 'skip'; reason: 'revision_uses_working_artifact' };

/**
 * Conservative sample policy: revisions edit conversation content without adding
 * fresh corpus context. A future Stage 1 signal may opt factual revisions in.
 */
export function retrievalPolicyFor(taskType: TaskType): RetrievalPolicy {
  return taskType === 'revision'
    ? { action: 'skip', reason: 'revision_uses_working_artifact' }
    : { action: 'retrieve', reason: 'task_default' };
}
