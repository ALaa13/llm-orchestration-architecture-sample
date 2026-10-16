import { projectPolicyAuthoring } from '../policy-rules/policy-authoring-projection';
import type { PolicyAuthoringProjection } from '../policy-rules/policy-authoring-projection.types';
import { projectPolicyVerification } from '../policy-rules/policy-verification-projection';
import type { PolicyVerificationProjection } from '../policy-rules/policy-verification-projection.types';
import { resolvePolicyApplicability } from '../policy-rules/policy-rule-applicability';
import type { ContextPackage } from './context-assembly.types';

export type GenerationModelContextPackage = Omit<
  ContextPackage,
  'generationConstraints'
> & {
  readonly generationConstraints: Omit<
    ContextPackage['generationConstraints'],
    'policyProfile'
  > & {
    readonly policyAuthoring: PolicyAuthoringProjection;
  };
};

export type VerificationModelContextPackage = Omit<
  ContextPackage,
  'generationConstraints'
> & {
  readonly generationConstraints: Omit<
    ContextPackage['generationConstraints'],
    'policyProfile'
  > & {
    readonly policyVerification: PolicyVerificationProjection;
  };
};

/** Provides Stage 5 with policy authoring and removes legacy profile authority. */
export function projectContextPackageForGeneration(
  contextPackage: ContextPackage,
): GenerationModelContextPackage {
  const { policyProfile, policyPlanning, ...generationConstraints } =
    contextPackage.generationConstraints;
  const planning = planningForApplicableArticleTask(
    policyProfile,
    policyPlanning,
  );

  return {
    ...contextPackage,
    generationConstraints: {
      policyAuthoring: projectPolicyAuthoring(policyProfile),
      ...(planning === undefined ? {} : { policyPlanning: planning }),
      ...generationConstraints,
    },
  };
}

/** Provides Stage 6 with policy semantics and removes legacy profile authority. */
export function projectContextPackageForVerification(
  contextPackage: ContextPackage,
  effectivePolicyPlanning: ContextPackage['generationConstraints']['policyPlanning'] = contextPackage
    .generationConstraints.policyPlanning,
): VerificationModelContextPackage {
  const { policyProfile, policyPlanning, ...generationConstraints } =
    contextPackage.generationConstraints;
  void policyPlanning;
  const planning = planningForApplicableArticleTask(
    policyProfile,
    effectivePolicyPlanning,
  );

  return {
    ...contextPackage,
    generationConstraints: {
      policyVerification: projectPolicyVerification(policyProfile),
      ...(planning === undefined ? {} : { policyPlanning: planning }),
      ...generationConstraints,
    },
  };
}

function planningForApplicableArticleTask(
  profile: ContextPackage['generationConstraints']['policyProfile'],
  planning: ContextPackage['generationConstraints']['policyPlanning'],
): ContextPackage['generationConstraints']['policyPlanning'] {
  return resolvePolicyApplicability(profile.usageArea, profile.taskType)
    .articleAuthoredOutput
    ? planning
    : undefined;
}
