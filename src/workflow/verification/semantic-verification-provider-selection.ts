import { SemanticVerificationService } from './semantic-verification.service';

export function selectSemanticVerificationService(
  provider: 'mock' | 'openai',
  mock: SemanticVerificationService,
  openAi: SemanticVerificationService,
): SemanticVerificationService {
  return provider === 'openai' ? openAi : mock;
}
