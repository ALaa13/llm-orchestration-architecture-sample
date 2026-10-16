import type { GenerationRequest, GenerationResult } from './generation.types';
import type { CancellationRuntime } from '../../common/cancellation/request-cancellation';

/**
 * Provider-neutral generation port owned by workflow orchestration.
 *
 * Provider-specific code belongs behind this boundary. Implementations receive
 * only the controlled ContextPackage and must not access the knowledge center
 * directly. Real streaming may later be introduced at this boundary.
 */
export abstract class GenerationService {
  abstract generate(
    request: GenerationRequest,
    runtime?: CancellationRuntime,
  ): Promise<GenerationResult>;
}
