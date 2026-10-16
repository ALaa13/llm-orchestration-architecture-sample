import { Injectable } from '@nestjs/common';
import type { ConversationContext } from '../conversation-context/conversation-context.types';
import { SemanticAnalysisService } from '../semantic-analysis/semantic-analysis.service';
import { InterpretationService } from './interpretation.service';
import type { InterpretationResult } from './interpretation.types';

/**
 * Compatibility facade for consumers of the historical Stage 1-only port.
 * The active workflow uses SemanticAnalysisService directly.
 */
@Injectable()
export class SemanticAnalysisInterpretationService extends InterpretationService {
  constructor(private readonly semanticAnalysis: SemanticAnalysisService) {
    super();
  }

  async interpret(context: ConversationContext): Promise<InterpretationResult> {
    return (await this.semanticAnalysis.analyze(context)).interpretation;
  }
}
