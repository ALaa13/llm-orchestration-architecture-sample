import type { ContextPackage } from '../context-assembly/context-assembly.types';
import type { GenerationResult } from '../generation/generation.types';
import type { PolicyPlanningInput } from '../policy-rules/article/article-authoring-plan.types';

export type VerificationDecision = 'pass' | 'refine' | 'reject';

/** Bounded, provider-neutral reasons that can affect output release. */
export enum VerificationReasonCode {
  Passed = 'VERIFICATION_PASSED',
  EmptyOutput = 'EMPTY_OUTPUT',
  OutputTruncated = 'OUTPUT_TRUNCATED',
  TaskNotFulfilled = 'TASK_NOT_FULFILLED',
  WrongUsageArea = 'WRONG_USAGE_AREA',
  PolicyRuleViolation = 'POLICY_RULE_VIOLATION',
  RevisionNotApplied = 'REVISION_NOT_APPLIED',
  ControlledKnowledgeContradiction = 'CONTROLLED_KNOWLEDGE_CONTRADICTION',
  UnsupportedSourceClaim = 'UNSUPPORTED_SOURCE_CLAIM',
  AttributionRequirementIgnored = 'ATTRIBUTION_REQUIREMENT_IGNORED',
  InternalContextLeak = 'INTERNAL_CONTEXT_LEAK',
  OutputUnsafeToRelease = 'OUTPUT_UNSAFE_TO_RELEASE',
  VerificationFailed = 'VERIFICATION_FAILED',
  MissingContextPackage = 'MISSING_CONTEXT_PACKAGE',
  MissingGenerationMetadata = 'MISSING_GENERATION_METADATA',
  RefinementLimitReached = 'REFINEMENT_LIMIT_REACHED',
}

export interface VerificationIssue {
  code: VerificationReasonCode;
  message: string;
}

export interface VerificationFeedback {
  issues: VerificationIssue[];
  revisionInstructions: string[];
}

export interface VerificationResult {
  decision: VerificationDecision;
  reasonCodes: VerificationReasonCode[];
  feedback?: VerificationFeedback;
  /**
   * User-facing output after application-owned attribution representation is
   * appended. Set only after semantic verification identifies material use.
   */
  resolvedOutput?: string;
}

/** Semantic-only reasons; attribution-label satisfaction is application-owned. */
export type SemanticVerificationReasonCode =
  | VerificationReasonCode.Passed
  | VerificationReasonCode.TaskNotFulfilled
  | VerificationReasonCode.WrongUsageArea
  | VerificationReasonCode.PolicyRuleViolation
  | VerificationReasonCode.RevisionNotApplied
  | VerificationReasonCode.ControlledKnowledgeContradiction
  | VerificationReasonCode.UnsupportedSourceClaim
  | VerificationReasonCode.OutputUnsafeToRelease;

export interface SemanticVerificationIssue {
  code: SemanticVerificationReasonCode;
  message: string;
}

export interface SemanticVerificationFeedback {
  issues: SemanticVerificationIssue[];
  revisionInstructions: string[];
}

/** Provider-neutral semantic findings consumed by the authoritative Stage 6 composer. */
export interface SemanticVerificationResult {
  decision: VerificationDecision;
  reasonCodes: SemanticVerificationReasonCode[];
  feedback?: SemanticVerificationFeedback;
  materiallyUsedRequiredSourceIds: string[];
}

/** Controlled input used by the final quality and governance gate. */
export interface VerificationContext {
  generationResult: GenerationResult;
  contextPackage: ContextPackage;
  refinementCount: number;
  /** Effective Stage 1 + Stage 5 plan used only as Stage 6 verification evidence. */
  effectivePolicyPlanning?: PolicyPlanningInput;
}

/** Internal node input; optional fields allow deterministic fail-closed checks. */
export interface VerificationInput {
  generationResult?: GenerationResult;
  contextPackage?: ContextPackage;
  refinementCount?: number;
}
