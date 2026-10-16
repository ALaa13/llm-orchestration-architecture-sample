import type { ConversationContext } from '../conversation-context/conversation-context.types';
import type { CombinedSemanticAnalysisResult } from './semantic-analysis.types';
import type { CancellationRuntime } from '../../common/cancellation/request-cancellation';

/**
 * Active provider-neutral boundary for the single shared semantic-analysis
 * call. It returns Stage 1 interpretation and bounded Stage 2 evidence while
 * leaving routing and protection authority to the workflow.
 */
export abstract class SemanticAnalysisService {
  abstract analyze(
    context: ConversationContext,
    runtime?: CancellationRuntime,
  ): Promise<CombinedSemanticAnalysisResult>;
}
