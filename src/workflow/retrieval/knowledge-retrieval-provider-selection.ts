import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

/** Selects the configured implementation while leaving workflow stages provider-neutral. */
export function selectKnowledgeRetrievalService(
  provider: 'mock' | 'knowledge_center',
  mock: KnowledgeRetrievalService,
  knowledgeCenter: KnowledgeRetrievalService,
): KnowledgeRetrievalService {
  return provider === 'knowledge_center' ? knowledgeCenter : mock;
}
