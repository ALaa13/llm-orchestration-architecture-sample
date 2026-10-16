import type {
  VerificationContext,
  SemanticVerificationResult,
} from './verification.types';
import type { CancellationRuntime } from '../../common/cancellation/request-cancellation';

/**
 * Active provider-neutral port for semantic quality and grounding evaluation.
 * The mock is the default implementation; OpenAI is an optional adapter.
 */
export abstract class SemanticVerificationService {
  abstract verify(
    context: VerificationContext,
    runtime?: CancellationRuntime,
  ): Promise<SemanticVerificationResult>;
}
