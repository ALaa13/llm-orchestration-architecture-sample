import { Injectable } from '@nestjs/common';
import { WorkingArtifactResolver } from '../artifacts/working-artifact.resolver';
import { resolvePolicyApplicability } from '../policy-rules/policy-rule-applicability';
import { resolvePolicyRuntimeProfile } from '../policy-rules/policy-runtime-profile.resolver';
import { PolicyFeedbackCompatibilityService } from '../feedback/policy-feedback-compatibility.service';
import type {
  ContextAssemblyInput,
  ContextPackage,
} from './context-assembly.types';

@Injectable()
export class ContextAssembler {
  constructor(
    private readonly workingArtifactResolver: WorkingArtifactResolver = new WorkingArtifactResolver(),
    private readonly feedbackCompatibility: PolicyFeedbackCompatibilityService = new PolicyFeedbackCompatibilityService(),
  ) {}

  assemble(input: ContextAssemblyInput): ContextPackage {
    // Stage 3 owns retrieval eligibility. Stage 4 only orders eligible domain
    // objects for deterministic generation input and preserves their metadata.
    const knowledge = [...input.knowledge].sort(
      (first, second) =>
        second.relevanceScore - first.relevanceScore ||
        first.id.localeCompare(second.id),
    );
    const workingArtifact =
      input.interpretation.taskType === 'revision'
        ? this.workingArtifactResolver.resolve(
            input.recentMessages,
            input.interpretation.workingArtifactMessageIndex,
          )
        : undefined;
    const policyProfile = resolvePolicyRuntimeProfile({
      usageArea: input.interpretation.usageArea,
      taskType: input.interpretation.taskType,
    });
    const policyPlanning = resolvePolicyApplicability(
      input.interpretation.usageArea,
      input.interpretation.taskType,
    ).articleAuthoredOutput
      ? input.policyPlanning
      : undefined;
    const compatibleReusableFeedback =
      this.feedbackCompatibility.compatibleRules(
        input.committedRules ?? [],
        policyProfile,
      );

    return {
      request: {
        usageArea: input.interpretation.usageArea,
        taskType: input.interpretation.taskType,
        responseLanguage: input.interpretation.responseLanguage ?? 'en',
        intent: input.interpretation.intent,
        latestUserMessage: input.latestUserMessage,
        refersToPreviousContext: input.interpretation.refersToPreviousContext,
      },
      conversation: {
        recentMessages: [...input.recentMessages],
        recentMessageCount: input.recentMessages.length,
        ...(workingArtifact === undefined
          ? {}
          : {
              workingArtifact: {
                content: workingArtifact,
                source:
                  input.interpretation.workingArtifactMessageIndex === undefined
                    ? ('latest_assistant_message' as const)
                    : ('interpreted_assistant_message' as const),
              },
            }),
      },
      knowledge,
      generationConstraints: {
        policyProfile,
        ...(policyPlanning === undefined ? {} : { policyPlanning }),
        knowledge: {
          role: 'supporting_context',
          preserveSourceMetadata: true,
          preserveAttributionRequirements: true,
          unsupportedClaims: 'do_not_invent',
        },
        conversation: {
          useRecentContext: input.interpretation.refersToPreviousContext,
        },
        reusableFeedback: {
          authority: 'reusable_feedback',
          role: 'subordinate_preferences',
          rules: compatibleReusableFeedback,
        },
        ...(input.interpretation.taskType === 'revision'
          ? {
              revision: {
                mode: 'edit_existing_artifact' as const,
                preserveUnaffectedContent: true as const,
                makeSmallestReasonableChange: true as const,
                introduceUnrelatedContent: false as const,
              },
            }
          : {}),
        output: {
          generatedOutputIsKnowledge: false,
        },
      },
    };
  }
}
