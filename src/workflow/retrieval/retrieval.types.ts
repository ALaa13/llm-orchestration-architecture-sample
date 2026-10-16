import type {
  TaskType,
  UsageArea,
} from '../interpretation/interpretation.types';

export type KnowledgeUsageArea = Exclude<UsageArea, 'unknown'>;
export type KnowledgeItemStatus = 'approved' | 'quarantined';

// KC's governed transport vocabulary. These values do not define application policy.
export const KNOWLEDGE_STATUSES = [
  'validated',
  'evolving',
  'condensed',
  'exploratory',
  'corrective',
] as const;
export const CONTEXT_BINDINGS = ['general', 'request_specific'] as const;

export interface KnowledgeProvenanceRef {
  sourceId: string;
  sourceTitle: string;
  sourceVersionId: string;
  sourceSegmentId: string;
  sourceSegmentVersionId: string;
  relationRole: string;
}

/** The workflow-owned request contract sent to any knowledge implementation. */
export interface RetrievalRequest {
  query: string;
  usageArea: UsageArea;
  taskType: TaskType;
}

/** Normalized knowledge returned to the workflow, independent of storage. */
export interface RetrievedKnowledgeItem {
  // Optional for non-KC/mock providers; the KC HTTP adapter requires all five.
  candidateId?: string;
  candidateVersionId?: string;
  knowledgeStatus?: (typeof KNOWLEDGE_STATUSES)[number];
  contextBinding?: (typeof CONTEXT_BINDINGS)[number];
  provenanceRefs?: KnowledgeProvenanceRef[];
  id: string;
  content: string;
  relevanceScore: number;
  source: {
    id: string;
    title?: string;
  };
  status: KnowledgeItemStatus;
  allowedUsageAreas: KnowledgeUsageArea[];
  attributionRequired: boolean;
}
