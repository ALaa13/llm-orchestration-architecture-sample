import { Injectable, Optional } from '@nestjs/common';
import {
  isRequestCancelled,
  throwIfAborted,
  type CancellationRuntime,
} from '../../common/cancellation/request-cancellation';
import { DeterministicVerificationChecks } from './deterministic-verification-checks';
import { SemanticVerificationService } from './semantic-verification.service';
import { resolveRequiredAttribution } from './attribution-verification-resolver';
import { AttributionDiagnosticsService } from './attribution-diagnostics.service';
import { appendMissingSourceSectionEntries } from '../attribution/attribution.contract';
import { hasTerminalSourcesSectionIntegrity } from '../attribution/attribution.contract';
import {
  VerificationReasonCode,
  type SemanticVerificationResult,
  type VerificationFeedback,
  type VerificationContext,
  type VerificationInput,
  type VerificationResult,
} from './verification.types';
import { resolveEffectivePolicyPlanning } from './effective-policy-planning';

@Injectable()
export class VerificationService {
  constructor(
    private readonly deterministicChecks: DeterministicVerificationChecks,
    private readonly semanticVerifier: SemanticVerificationService,
    @Optional()
    private readonly attributionDiagnostics?: AttributionDiagnosticsService,
  ) {}

  async verify(
    input: VerificationInput,
    runtime?: CancellationRuntime,
  ): Promise<VerificationResult> {
    throwIfAborted(runtime?.signal);
    const deterministic = this.deterministicChecks.evaluate(input);
    if (deterministic.result !== undefined) return deterministic.result;

    if (
      input.generationResult === undefined ||
      input.contextPackage === undefined
    ) {
      return {
        decision: 'reject',
        reasonCodes: [VerificationReasonCode.VerificationFailed],
        feedback: {
          issues: [
            {
              code: VerificationReasonCode.VerificationFailed,
              message:
                'Verification input was incomplete after deterministic checks.',
            },
          ],
          revisionInstructions: [],
        },
      };
    }

    const effectivePlanning = resolveEffectivePolicyPlanning(
      input.contextPackage,
      input.generationResult,
    ).effectivePlanningForVerification;
    const context: VerificationContext = {
      generationResult: input.generationResult,
      contextPackage: input.contextPackage,
      refinementCount: input.refinementCount ?? 0,
      ...(effectivePlanning === undefined
        ? {}
        : { effectivePolicyPlanning: effectivePlanning }),
    };

    try {
      const result =
        runtime === undefined
          ? await this.semanticVerifier.verify(context)
          : await this.semanticVerifier.verify(context, runtime);
      throwIfAborted(runtime?.signal);
      return this.composeResult(context, result);
    } catch (error: unknown) {
      if (isRequestCancelled(error, runtime?.signal)) throw error;
      // The workflow promotes this exception to technical failure. This keeps
      // provider outages distinct from a verifier's valid REJECT decision while
      // still ensuring no unverified output can be released.
      throw error;
    }
  }

  private composeResult(
    context: VerificationContext,
    semantic: SemanticVerificationResult,
  ): VerificationResult {
    const attribution = resolveRequiredAttribution(
      context.contextPackage,
      context.generationResult.content,
      semantic.materiallyUsedRequiredSourceIds,
    );
    this.attributionDiagnostics?.logEvaluation(
      context.contextPackage,
      context.generationResult.content,
      semantic,
      attribution,
    );

    if (attribution.invalidIdentityReason !== undefined) {
      return {
        decision: 'reject',
        reasonCodes: [VerificationReasonCode.VerificationFailed],
        feedback: {
          issues: [
            {
              code: VerificationReasonCode.VerificationFailed,
              message:
                'Semantic verification returned an invalid required-source identity.',
            },
          ],
          revisionInstructions: [],
        },
      };
    }

    if (attribution.missingAttributionLabels.length === 0) {
      return {
        decision: semantic.decision,
        reasonCodes: semantic.reasonCodes,
        ...(semantic.feedback === undefined
          ? {}
          : { feedback: semantic.feedback }),
      };
    }

    // Material-use identity comes from the semantic verifier; representing the
    // resulting human-readable labels is deterministic application work. A
    // source footer cannot change the answer's semantic quality, so avoid a
    // second generation attempt that may reintroduce the same omission.
    if (semantic.decision === 'pass') {
      const resolvedOutput = appendMissingSourceSectionEntries(
        context.generationResult.content,
        attribution.missingAttributionLabels,
      );
      if (!hasTerminalSourcesSectionIntegrity(resolvedOutput)) {
        return {
          decision: 'reject',
          reasonCodes: [VerificationReasonCode.VerificationFailed],
          feedback: {
            issues: [
              {
                code: VerificationReasonCode.VerificationFailed,
                message:
                  'Final attribution assembly did not produce one terminal Sources footer.',
              },
            ],
            revisionInstructions: [],
          },
        };
      }
      return {
        decision: semantic.decision,
        reasonCodes: semantic.reasonCodes,
        resolvedOutput,
      };
    }

    const attributionFeedback = this.attributionFeedback(
      attribution.missingAttributionLabels,
    );
    const semanticReasonCodes = semantic.reasonCodes.filter(
      (code) => code !== VerificationReasonCode.Passed,
    );

    return {
      decision: semantic.decision === 'reject' ? 'reject' : 'refine',
      reasonCodes: [
        ...semanticReasonCodes,
        VerificationReasonCode.AttributionRequirementIgnored,
      ],
      feedback: {
        issues: [
          ...(semantic.feedback?.issues ?? []),
          ...attributionFeedback.issues,
        ],
        revisionInstructions: [
          ...(semantic.feedback?.revisionInstructions ?? []),
          ...attributionFeedback.revisionInstructions,
        ],
      },
    };
  }

  private attributionFeedback(labels: readonly string[]): VerificationFeedback {
    const formattedLabels = labels.join(', ');
    const sourceEntries = labels.map((label) => `\`${label}\``).join(', ');
    return {
      issues: [
        {
          code: VerificationReasonCode.AttributionRequirementIgnored,
          message: `Required attribution is missing for ${formattedLabels}.`,
        },
      ],
      revisionInstructions: [
        `Preserve the existing response and add the exact ${labels.length === 1 ? 'label' : 'labels'} ${sourceEntries} to the final Sources section.`,
      ],
    };
  }
}
