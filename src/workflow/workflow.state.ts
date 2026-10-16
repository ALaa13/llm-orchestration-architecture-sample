import { Annotation } from '@langchain/langgraph';
import type { ContextPackage } from './context-assembly/context-assembly.types';
import type { ChatMessage } from './conversation-context/conversation-context.types';
import type {
  GenerationRefinementContext,
  GenerationResult,
} from './generation/generation.types';
import type { InterpretationResult } from './interpretation/interpretation.types';
import type { RuleCandidate } from './feedback/feedback.types';
import type { FeedbackApprovalResolution } from './feedback/feedback-approval.types';
import type { ProtectionResult } from './protection/protection.types';
import type { RetrievedKnowledgeItem } from './retrieval/retrieval.types';
import type { ZeroKnowledgePolicy } from './retrieval/zero-knowledge-policy';
import type { ProtectionSemanticEvidence } from './semantic-analysis/semantic-analysis.types';
import type { VerificationResult } from './verification/verification.types';
import type { WorkflowFailure, WorkflowOutcome } from './workflow-failure';

export type { ProtectionDecision } from './protection/protection.types';

/**
 * Shared state passed between the existing LangGraph nodes.
 *
 * Reducers replace request-scoped arrays because this graph currently runs once
 * per HTTP request. No checkpointing or cross-request memory is used yet.
 */
export const WorkflowStateAnnotation = Annotation.Root({
  // Trusted transport metadata, never included in conversation or model context.
  ownerUserId: Annotation<string | undefined>,
  messages: Annotation<ChatMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  // Derived by interpretInput; kept separately for downstream mock checks.
  latestUserMessage: Annotation<string | undefined>,
  recentMessages: Annotation<ChatMessage[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  // Policy interpretation data, including usageArea. Do not duplicate its
  // fields at the top level when adding downstream behavior.
  interpretation: Annotation<InterpretationResult | undefined>,
  feedbackCandidate: Annotation<RuleCandidate | undefined>,
  feedbackApprovalResolution: Annotation<
    FeedbackApprovalResolution | undefined
  >,
  protectionSemanticEvidence: Annotation<
    ProtectionSemanticEvidence | undefined
  >,
  protectionResult: Annotation<ProtectionResult | undefined>,
  knowledge: Annotation<RetrievedKnowledgeItem[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  // Set after a successful fresh retrieval. It keeps an expected zero-item
  // result distinct from a retrieval infrastructure failure.
  zeroKnowledgePolicy: Annotation<ZeroKnowledgePolicy | undefined>,
  contextPackage: Annotation<ContextPackage | undefined>,
  generationResult: Annotation<GenerationResult | undefined>,
  refinement: Annotation<GenerationRefinementContext | undefined>,
  verificationResult: Annotation<VerificationResult | undefined>,
  refinementCount: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  // Safe terminal response for protection and verification rejection paths.
  output: Annotation<string | undefined>,
  outcome: Annotation<WorkflowOutcome | undefined>,
  failure: Annotation<WorkflowFailure | undefined>,
});

export type WorkflowState = typeof WorkflowStateAnnotation.State;
