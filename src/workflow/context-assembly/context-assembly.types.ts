import type { ChatMessage } from '../conversation-context/conversation-context.types';
import type {
  InterpretationResult,
  ResponseLanguage,
  TaskType,
  UsageArea,
} from '../interpretation/interpretation.types';
import type { RetrievedKnowledgeItem } from '../retrieval/retrieval.types';
import type { CommittedRule } from '../feedback/committed-rule-retrieval.service';
import type { PolicyRuntimeProfile } from '../policy-rules/policy-runtime-profile.types';
import type { PolicyPlanningInput } from '../policy-rules/article/article-authoring-plan.types';

/** Narrow, workflow-owned input passed to context assembly. */
export interface ContextAssemblyInput {
  latestUserMessage: string;
  interpretation: InterpretationResult;
  knowledge: RetrievedKnowledgeItem[];
  recentMessages: ChatMessage[];
  committedRules?: CommittedRule[];
  policyPlanning?: PolicyPlanningInput;
}

/**
 * Controlled boundary between orchestration and the future generation model.
 * The model should receive this package, not unrestricted corpus access.
 */
export interface ContextPackage {
  request: {
    usageArea: UsageArea;
    taskType: TaskType;
    responseLanguage: ResponseLanguage;
    intent: string;
    latestUserMessage: string;
    refersToPreviousContext: boolean;
  };
  conversation: {
    recentMessages: ChatMessage[];
    recentMessageCount: number;
    workingArtifact?: {
      content: string;
      source: 'latest_assistant_message' | 'interpreted_assistant_message';
    };
  };
  knowledge: RetrievedKnowledgeItem[];
  generationConstraints: {
    /** Authoritative source for stage-specific policy model projections. */
    policyProfile: PolicyRuntimeProfile;
    /** Reliable upstream decisions only; missing choices remain Stage 5-owned. */
    policyPlanning?: PolicyPlanningInput;
    knowledge: {
      role: 'supporting_context';
      preserveSourceMetadata: true;
      preserveAttributionRequirements: true;
      unsupportedClaims: 'do_not_invent';
    };
    conversation: {
      useRecentContext: boolean;
    };
    reusableFeedback?: {
      authority: 'reusable_feedback';
      role: 'subordinate_preferences';
      rules: CommittedRule[];
    };
    revision?: {
      mode: 'edit_existing_artifact';
      preserveUnaffectedContent: true;
      makeSmallestReasonableChange: true;
      introduceUnrelatedContent: false;
    };
    output: {
      generatedOutputIsKnowledge: false;
    };
  };
}
