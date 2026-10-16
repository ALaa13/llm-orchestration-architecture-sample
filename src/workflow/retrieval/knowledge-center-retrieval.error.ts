export type KnowledgeCenterRetrievalErrorCategory =
  | 'configuration'
  | 'timeout'
  | 'authentication'
  | 'permission'
  | 'unavailable'
  | 'invalid_request'
  | 'invalid_response';

/** Safe, categorized failure for the external Knowledge Center boundary. */
export class KnowledgeCenterRetrievalError extends Error {
  constructor(readonly category: KnowledgeCenterRetrievalErrorCategory) {
    super(`Knowledge Center retrieval failed: ${category}`);
    this.name = 'KnowledgeCenterRetrievalError';
  }
}
