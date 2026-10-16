import { GenerationService } from '../../workflow/generation/generation.service';

export type GenerationProvider = 'mock' | 'anthropic';

export function selectGenerationService(
  provider: GenerationProvider,
  mock: GenerationService,
  anthropic: GenerationService,
): GenerationService {
  return provider === 'anthropic' ? anthropic : mock;
}
