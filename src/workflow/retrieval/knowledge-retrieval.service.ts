import type {
  RetrievalRequest,
  RetrievedKnowledgeItem,
} from './retrieval.types';
import type { CancellationRuntime } from '../../common/cancellation/request-cancellation';

/**
 * Stable workflow boundary for knowledge retrieval.
 *
 * A future adapter may call a separate knowledge-center API, database-backed
 * service, vector retrieval system, or other infrastructure. LangGraph must not
 * depend on PostgreSQL, vector database schemas, or internal storage details.
 */
export abstract class KnowledgeRetrievalService {
  abstract retrieve(
    request: RetrievalRequest,
    runtime?: CancellationRuntime,
  ): Promise<RetrievedKnowledgeItem[]>;
}
