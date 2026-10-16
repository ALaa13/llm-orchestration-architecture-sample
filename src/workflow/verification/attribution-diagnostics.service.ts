import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logging';
import type { ApplicationConfig } from '../../config/configuration';
import {
  hasDuplicateSourceSectionEntries,
  hasSourcesSection,
  humanReadableSourceLabel,
  normalizedAttributionLabel,
  sourceSectionEntries,
} from '../attribution/attribution.contract';
import type { ContextPackage } from '../context-assembly/context-assembly.types';
import type { VerificationFeedback } from './verification.types';
import type { AttributionResolution } from './attribution-verification-resolver';
import type { SemanticVerificationResult } from './verification.types';

@Injectable()
export class AttributionDiagnosticsService {
  constructor(
    private readonly config: ConfigService<ApplicationConfig, true>,
    private readonly logger: AppLogger,
  ) {}

  logEvaluation(
    contextPackage: ContextPackage,
    output: string,
    semantic: SemanticVerificationResult,
    resolution: AttributionResolution,
  ): void {
    if (!this.enabled()) return;
    const parsedSourceEntries = sourceSectionEntries(output);
    const parsedLabels = new Set(
      parsedSourceEntries.map(normalizedAttributionLabel),
    );
    const requiredSources = contextPackage.knowledge
      .filter((item) => item.attributionRequired)
      .map((item) => ({
        id: item.source.id,
        title: humanReadableSourceLabel(item),
        attributionRequired: true,
      }));

    this.logger.info(
      'verification.attribution.debug',
      'Stage 6 attribution diagnostics.',
      {
        requiredSources,
        sourcesSectionExists: hasSourcesSection(output),
        parsedSourceEntries,
        duplicateLabelsDetected: hasDuplicateSourceSectionEntries(output),
        requiredTitlePresence: requiredSources.map((source) => ({
          id: source.id,
          title: source.title,
          present:
            source.title !== undefined &&
            parsedLabels.has(normalizedAttributionLabel(source.title)),
        })),
        semanticDecision: semantic.decision,
        semanticReasonCodes: semantic.reasonCodes,
        semanticIssues: semantic.feedback?.issues ?? [],
        semanticRevisionInstructions:
          semantic.feedback?.revisionInstructions ?? [],
        materiallyUsedRequiredSourceIds:
          semantic.materiallyUsedRequiredSourceIds,
        missingAttributionLabels: resolution.missingAttributionLabels,
        invalidIdentityReason: resolution.invalidIdentityReason,
      },
    );
  }

  logRefinement(
    refinementNumber: number,
    contextPackage: ContextPackage,
    feedback: VerificationFeedback,
  ): void {
    if (!this.enabled()) return;
    const serializedFeedback = JSON.stringify(feedback);
    const requiredSourceLabelsPassedToGenerator = contextPackage.knowledge
      .filter((item) => item.attributionRequired)
      .map(humanReadableSourceLabel)
      .filter((label): label is string => label !== undefined)
      .filter((label) => serializedFeedback.includes(label));

    this.logger.info(
      'generation.refinement.attribution.debug',
      'Stage 5 refinement attribution diagnostics.',
      {
        refinementNumber,
        reasonCodes: [...new Set(feedback.issues.map((issue) => issue.code))],
        requiredSourceLabelsPassedToGenerator,
        revisionInstructionSummary: feedback.revisionInstructions,
      },
    );
  }

  private enabled(): boolean {
    return this.config.get('logging.attributionDebug', { infer: true });
  }
}
