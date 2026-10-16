import { Injectable, Optional } from '@nestjs/common';
import { END, START, StateGraph, type Runtime } from '@langchain/langgraph';
import { AppLogger, type LogMetadata } from '../common/logging';
import {
  isRequestCancelled,
  RequestCancelledError,
  throwIfAborted,
  type CancellationRuntime,
} from '../common/cancellation/request-cancellation';
import { ContextAssembler } from './context-assembly/context-assembler.service';
import type {
  ContextAssemblyInput,
  ContextPackage,
} from './context-assembly/context-assembly.types';
import { ConversationContextBuilder } from './conversation-context/conversation-context.builder';
import type { ChatMessage } from './conversation-context/conversation-context.types';
import { GenerationService } from './generation/generation.service';
import type {
  GenerationRefinementContext,
  GenerationRequest,
} from './generation/generation.types';
import { ProtectionService } from './protection/protection.service';
import type {
  ProtectionContext,
  ProtectionDecision,
} from './protection/protection.types';
import { KnowledgeCandidateFilter } from './retrieval/knowledge-candidate-filter';
import { SemanticAnalysisService } from './semantic-analysis/semantic-analysis.service';
import { combinedSemanticAnalysisResultSchema } from './semantic-analysis/semantic-analysis.types';
import type { InterpretationResult } from './interpretation/interpretation.types';
import { KnowledgeRetrievalService } from './retrieval/knowledge-retrieval.service';
import type {
  RetrievalRequest,
  RetrievedKnowledgeItem,
} from './retrieval/retrieval.types';
import { retrievalPolicyFor } from './retrieval/retrieval-policy';
import { zeroKnowledgePolicyFor } from './retrieval/zero-knowledge-policy';
import { VerificationService } from './verification/verification.service';
import {
  VerificationReasonCode,
  type VerificationDecision,
  type VerificationInput,
  type VerificationResult,
} from './verification/verification.types';
import { MAX_REFINEMENT_COUNT } from './verification/verification.constants';
import { AttributionDiagnosticsService } from './verification/attribution-diagnostics.service';
import { FeedbackAnalyzer } from './feedback/feedback-analyzer.service';
import { FeedbackApprovalService } from './feedback/feedback-approval.service';
import { CommittedRuleRetrievalService } from './feedback/committed-rule-retrieval.service';
import type { RuleCandidate, RuleScope } from './feedback/feedback.types';
import { approvalProposalRule } from './artifacts/control-plane-response';
import type {
  FeedbackExecutionMode,
  UsageArea,
} from './interpretation/interpretation.types';
import { type WorkflowState, WorkflowStateAnnotation } from './workflow.state';
import {
  createWorkflowFailure,
  type WorkflowOutcome,
  type WorkflowStage,
} from './workflow-failure';

const WORKFLOW_STAGE_COUNT = 6;
export { MAX_REFINEMENT_COUNT };
const REJECTED_OUTPUT = 'Generated output was rejected by verification.';

interface WorkflowExecutionContext {
  currentStage: string;
  completedStageCount: number;
  refinementCount: number;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly contextBuilder: ConversationContextBuilder,
    private readonly semanticAnalysisService: SemanticAnalysisService,
    private readonly protectionService: ProtectionService,
    private readonly knowledgeRetrievalService: KnowledgeRetrievalService,
    private readonly knowledgeCandidateFilter: KnowledgeCandidateFilter,
    private readonly contextAssembler: ContextAssembler,
    private readonly generationService: GenerationService,
    private readonly verificationService: VerificationService,
    private readonly logger: AppLogger,
    @Optional()
    private readonly attributionDiagnostics?: AttributionDiagnosticsService,
    @Optional()
    private readonly feedbackAnalyzer?: FeedbackAnalyzer,
    @Optional()
    private readonly feedbackApprovalService?: FeedbackApprovalService,
    @Optional()
    private readonly committedRuleRetrievalService?: CommittedRuleRetrievalService,
  ) {}

  /**
   * The single request workflow. It has no checkpointer or workflow memory;
   * feedback records use their separate domain persistence boundary.
   */
  private readonly graph = new StateGraph(WorkflowStateAnnotation)
    .addNode('interpretInput', (state, runtime) =>
      this.runNode(
        'interpret_input',
        () => this.interpretInput(state, runtime),
        runtime,
      ),
    )
    .addNode('protectionCheck', (state, runtime) =>
      this.runNode(
        'protection_check',
        () => this.protectionCheck(state, runtime),
        runtime,
      ),
    )
    .addNode('retrieveKnowledge', (state, runtime) =>
      this.runNode(
        'retrieve_knowledge',
        () => this.retrieveKnowledge(state, runtime),
        runtime,
      ),
    )
    .addNode('assembleContext', (state, runtime) =>
      this.runNode(
        'assemble_context',
        () => this.assembleContext(state, runtime),
        runtime,
      ),
    )
    .addNode('generateOutput', (state, runtime) =>
      this.runNode(
        'generate_output',
        () => this.generateOutput(state, runtime),
        runtime,
      ),
    )
    .addNode('verifyOutput', (state, runtime) =>
      this.runNode(
        'verify_output',
        () => this.verifyOutput(state, runtime),
        runtime,
      ),
    )
    .addEdge(START, 'interpretInput')
    .addConditionalEdges(
      'interpretInput',
      (state) =>
        state.failure
          ? 'failed'
          : state.feedbackApprovalResolution === undefined ||
              state.feedbackApprovalResolution.outcome === 'apply_current'
            ? state.interpretation !== undefined &&
              !isValidFeedbackExecutionMode(
                state.interpretation,
                feedbackExecutionModeFor(state.interpretation),
              )
              ? 'semanticUnresolved'
              : state.interpretation !== undefined &&
                  feedbackExecutionModeFor(state.interpretation) ===
                    'preference_only'
                ? 'preferenceOnly'
                : 'continue'
            : 'feedbackResolved',
      {
        failed: END,
        semanticUnresolved: END,
        continue: 'protectionCheck',
        preferenceOnly: END,
        feedbackResolved: END,
      },
    )
    .addConditionalEdges(
      'protectionCheck',
      (state) =>
        state.failure ? 'failed' : (state.protectionResult?.decision ?? 'stop'),
      {
        failed: END,
        continue: 'retrieveKnowledge',
        clarify: END,
        stop: END,
      },
    )
    .addConditionalEdges(
      'retrieveKnowledge',
      (state) =>
        state.failure
          ? 'failed'
          : state.zeroKnowledgePolicy?.action === 'clarify'
            ? 'clarify'
            : 'continue',
      {
        failed: END,
        clarify: END,
        continue: 'assembleContext',
      },
    )
    .addConditionalEdges(
      'assembleContext',
      (state) => (state.failure ? 'failed' : 'continue'),
      {
        failed: END,
        continue: 'generateOutput',
      },
    )
    .addConditionalEdges(
      'generateOutput',
      (state) => (state.failure ? 'failed' : 'continue'),
      {
        failed: END,
        continue: 'verifyOutput',
      },
    )
    .addConditionalEdges(
      'verifyOutput',
      (state) =>
        state.failure
          ? 'failed'
          : (state.verificationResult?.decision ?? 'reject'),
      {
        failed: END,
        pass: END,
        refine: 'generateOutput',
        reject: END,
      },
    )
    .compile();

  async run(
    messages: ChatMessage[],
    cancellation?: CancellationRuntime,
    ownerUserId?: string,
  ): Promise<WorkflowState> {
    const execution: WorkflowExecutionContext = {
      currentStage: 'Interpret Input',
      completedStageCount: 0,
      refinementCount: 0,
    };
    this.logger.info(
      'workflow.started',
      `Workflow started — processing ${messages.length} conversation messages.`,
      { messageCount: messages.length, firstStage: 'Interpret Input' },
    );

    let state: WorkflowState;
    try {
      const config = {
        configurable: {
          workflowExecution: execution,
          hasExternalCancellation: cancellation?.signal !== undefined,
        },
        ...(cancellation?.signal === undefined
          ? {}
          : { signal: cancellation.signal }),
      };
      state = await this.graph.invoke({ messages, ownerUserId }, config);
      throwIfAborted(cancellation?.signal);
    } catch (error: unknown) {
      if (isRequestCancelled(error, cancellation?.signal)) {
        this.logger.info(
          'workflow.cancelled',
          'Workflow cancelled by the client.',
          {
            completedStageCount: execution.completedStageCount,
            currentStage: execution.currentStage,
            refinementCount: execution.refinementCount,
          },
        );
        throw new RequestCancelledError();
      }
      const failure = createWorkflowFailure(
        workflowStageFor(execution.currentStage),
        error,
        this.logger.requestId(),
      );
      this.logger.error(
        'workflow.failed',
        'Workflow failed at its boundary.',
        undefined,
        {
          stage: failure.stage,
          category: failure.category,
          retryable: failure.retryable,
          causeClass: failure.causeClass,
          completedStageCount: execution.completedStageCount,
          refinementCount: execution.refinementCount,
        },
      );
      state = failedWorkflowState(messages, failure);
    }
    const decision = state.protectionResult?.decision ?? 'stop';
    const outcome: WorkflowOutcome = state.failure
      ? 'failed'
      : state.feedbackApprovalResolution?.outcome === 'ambiguous' ||
          state.feedbackApprovalResolution?.outcome === 'unclear' ||
          state.feedbackApprovalResolution?.outcome === 'conflict' ||
          state.feedbackApprovalResolution?.outcome === 'conflict_uncertain'
        ? 'clarify'
        : state.feedbackApprovalResolution !== undefined &&
            state.feedbackApprovalResolution.outcome !== 'apply_current'
          ? 'pass'
          : state.interpretation !== undefined &&
              !isValidFeedbackExecutionMode(
                state.interpretation,
                feedbackExecutionModeFor(state.interpretation),
              )
            ? 'clarify'
            : state.interpretation !== undefined &&
                feedbackExecutionModeFor(state.interpretation) ===
                  'preference_only'
              ? 'pass'
              : state.zeroKnowledgePolicy?.action === 'clarify'
                ? 'clarify'
                : decision === 'continue'
                  ? state.verificationResult?.decision === 'pass'
                    ? 'pass'
                    : 'reject'
                  : decision === 'clarify'
                    ? 'clarify'
                    : 'reject';
    const completedStageCount = execution.completedStageCount;

    this.logger.info(
      state.failure ? 'workflow.failed' : 'workflow.completed',
      state.failure
        ? 'Workflow failed safely.'
        : `Workflow completed — ${this.describeOutcome(state)}`,
      {
        outcome,
        completedStageCount,
        totalStageCount: WORKFLOW_STAGE_COUNT,
        knowledgeItemCount: state.knowledge.length,
        outputProduced:
          state.generationResult !== undefined || state.output !== undefined,
        generationModel: state.generationResult?.model,
        verificationDecision: state.verificationResult?.decision,
        refinementCount: state.refinementCount,
        ...(state.failure
          ? {
              stage: state.failure.stage,
              category: state.failure.category,
              retryable: state.failure.retryable,
              causeClass: state.failure.causeClass,
            }
          : {}),
      },
    );
    return { ...state, outcome };
  }

  private async interpretInput(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Interpret Input');
    // Keep orchestration in the node and semantic behavior behind the service
    // abstraction so changing providers does not reshape the graph.
    const context = this.contextBuilder.build(state.messages);
    const providerResult = hasExternalCancellation(runtime)
      ? await this.semanticAnalysisService.analyze(context, runtime)
      : await this.semanticAnalysisService.analyze(context);
    const semanticAnalysis =
      combinedSemanticAnalysisResultSchema.parse(providerResult);
    throwIfAborted(runtime.signal);
    const { interpretation, protectionEvidence } = semanticAnalysis;
    const proposedRule = immediatelyPrecedingApprovalRule(
      context.recentMessages,
    );
    const providerApprovalIntent = interpretation.feedbackApprovalIntent;
    const feedbackApprovalIntent =
      providerApprovalIntent === 'none' &&
      proposedRule !== undefined &&
      isExplicitSaveConfirmation(context.latestUserMessage)
        ? 'approve'
        : providerApprovalIntent;
    if (
      feedbackApprovalIntent === 'approve' ||
      feedbackApprovalIntent === 'apply_current' ||
      feedbackApprovalIntent === 'reject' ||
      feedbackApprovalIntent === 'keep_existing' ||
      feedbackApprovalIntent === 'replace_existing' ||
      feedbackApprovalIntent === 'unclear'
    ) {
      const feedbackApprovalResolution =
        await this.feedbackApprovalService?.resolvePendingDecision(
          state.ownerUserId,
          feedbackApprovalIntent,
          proposedRule,
        );
      throwIfAborted(runtime.signal);
      if (feedbackApprovalResolution !== undefined) {
        const applyCurrentDraft =
          feedbackApprovalResolution.outcome === 'apply_current';
        const resolvedInterpretation = applyCurrentDraft
          ? currentDraftFeedbackInterpretation(
              interpretation,
              feedbackApprovalResolution.candidate,
            )
          : interpretation;
        this.logStageCompleted(
          1,
          'Interpret Input',
          'Pending feedback approval decision resolved.',
          applyCurrentDraft ? 'Protection Check' : 'Workflow End',
          { feedbackApprovalOutcome: feedbackApprovalResolution.outcome },
        );
        this.completeStage(runtime);
        return {
          latestUserMessage: context.latestUserMessage,
          recentMessages: context.recentMessages,
          interpretation: resolvedInterpretation,
          feedbackApprovalResolution,
          protectionSemanticEvidence: protectionEvidence,
        };
      }
    }
    const feedbackExecutionMode = feedbackExecutionModeFor(interpretation);
    if (!isValidFeedbackExecutionMode(interpretation, feedbackExecutionMode)) {
      const clarifiedInterpretation: InterpretationResult = {
        ...interpretation,
        needsClarification: true,
        clarification: {
          reason: 'task_type',
          question:
            'Should I remember this feedback for future content, or also change the current draft?',
        },
      };
      this.logStageCompleted(
        1,
        'Interpret Input',
        'Feedback execution mode was unresolved; clarification is required.',
        'Workflow End',
        {
          usageArea: interpretation.usageArea,
          taskType: interpretation.taskType,
          feedbackIntent: interpretation.feedbackIntent,
          feedbackExecutionMode,
        },
      );
      this.completeStage(runtime);
      return {
        latestUserMessage: context.latestUserMessage,
        recentMessages: context.recentMessages,
        interpretation: clarifiedInterpretation,
        protectionSemanticEvidence: protectionEvidence,
      };
    }
    let feedbackCandidate;
    if (interpretation.feedbackIntent === 'reusable_preference') {
      feedbackCandidate = this.requireFeedbackAnalyzer().analyze({
        originalFeedback: context.latestUserMessage,
        usageArea: interpretation.usageArea,
        recentMessages: context.recentMessages,
        refersToPreviousContext: interpretation.refersToPreviousContext,
      });
    }
    if (feedbackCandidate?.status === 'pending_approval') {
      feedbackCandidate =
        await this.requireFeedbackApprovalService().persistPendingCandidate(
          state.ownerUserId,
          feedbackCandidate,
        );
      throwIfAborted(runtime.signal);
    }

    this.logStageCompleted(
      1,
      'Interpret Input',
      'Request understood and classified.',
      feedbackExecutionMode === 'preference_only'
        ? 'Workflow End'
        : 'Protection Check',
      {
        usageArea: interpretation.usageArea,
        taskType: interpretation.taskType,
        feedbackIntent: interpretation.feedbackIntent,
        feedbackExecutionMode,
        needsClarification: interpretation.needsClarification,
        requestScopeUnclear: protectionEvidence.requestScopeUnclear,
        totalMessageCount: context.messageCount,
        recentMessageCount: context.recentMessages.length,
        interpretationResult: {
          usageArea: interpretation.usageArea,
          taskType: interpretation.taskType,
          feedbackIntent: interpretation.feedbackIntent,
          feedbackExecutionMode,
          refersToPreviousContext: interpretation.refersToPreviousContext,
          needsClarification: interpretation.needsClarification,
          feedbackCandidate:
            feedbackCandidate === undefined
              ? undefined
              : {
                  status: feedbackCandidate.status,
                  referenceType: feedbackCandidate.referenceType,
                  scope: feedbackCandidate.scope,
                  referenceResolved:
                    feedbackCandidate.referencedContent !== undefined,
                  derivedRulePresent:
                    feedbackCandidate.derivedRule !== undefined,
                },
        },
      },
    );

    this.completeStage(runtime);
    return {
      latestUserMessage: context.latestUserMessage,
      recentMessages: context.recentMessages,
      interpretation,
      feedbackCandidate,
      protectionSemanticEvidence: protectionEvidence,
    };
  }

  private requireFeedbackAnalyzer(): FeedbackAnalyzer {
    if (this.feedbackAnalyzer === undefined) {
      throw new Error('Feedback analyzer is not configured.');
    }
    return this.feedbackAnalyzer;
  }

  private requireFeedbackApprovalService(): FeedbackApprovalService {
    if (this.feedbackApprovalService === undefined) {
      throw new Error('Feedback approval service is not configured.');
    }
    return this.feedbackApprovalService;
  }

  private async runNode(
    stage: WorkflowStage,
    node: () => Promise<Partial<WorkflowState>> | Partial<WorkflowState>,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    const startedAt = Date.now();
    try {
      return await node();
    } catch (error: unknown) {
      if (isRequestCancelled(error, runtime.signal)) throw error;
      const failure = createWorkflowFailure(
        stage,
        error,
        this.logger.requestId(),
        stage === 'retrieve_knowledge'
          ? 'retrieval_failure'
          : stage === 'assemble_context'
            ? 'context_assembly_failure'
            : undefined,
      );
      const execution = executionContext(runtime);
      this.logger.error(
        'workflow.stage.failed',
        'Workflow stage failed.',
        undefined,
        {
          stage,
          category: failure.category,
          retryable: failure.retryable,
          causeClass: failure.causeClass,
          latencyMs: Date.now() - startedAt,
          completedStageCount: execution.completedStageCount,
          refinementCount: execution.refinementCount,
        },
      );
      return { failure, outcome: 'failed', output: undefined };
    }
  }

  private async protectionCheck(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Protection Check');
    const interpretation = state.interpretation;
    const protectionSemanticEvidence = state.protectionSemanticEvidence;
    if (!interpretation || !protectionSemanticEvidence) {
      throw new Error(
        'Protection check requires interpretation and semantic evidence.',
      );
    }

    const context: ProtectionContext = {
      interpretation,
      latestUserMessage: state.latestUserMessage ?? '',
      protectionSemanticEvidence,
    };
    const evaluation = await this.protectionService.evaluate(context);
    throwIfAborted(runtime.signal);
    const protectionResult = evaluation.result;
    const output =
      protectionResult.decision === 'clarify'
        ? 'Please clarify your request.'
        : protectionResult.decision === 'stop'
          ? 'Request stopped by protection check.'
          : undefined;
    const nextStage =
      protectionResult.decision === 'continue'
        ? 'Retrieve Knowledge'
        : 'Workflow End';

    this.logStageCompleted(
      2,
      'Protection Check',
      protectionResult.decision === 'continue'
        ? 'Request passed protection checks.'
        : protectionResult.decision === 'clarify'
          ? 'Request needs clarification; downstream stages will be skipped.'
          : 'Request was stopped; downstream stages will be skipped.',
      nextStage,
      {
        decision: protectionResult.decision,
        reasonCode: protectionResult.reasonCode,
        evaluator:
          evaluation.semanticEvidenceResult === protectionResult
            ? 'precomputed-semantic-evidence'
            : 'deterministic-rule',
        semanticEvidence: {
          requestScopeUnclear: protectionSemanticEvidence.requestScopeUnclear,
          consumed: evaluation.semanticEvidenceResult !== undefined,
        },
        protectionResult: {
          decision: protectionResult.decision,
          reasonCode: protectionResult.reasonCode,
        },
      },
    );

    this.completeStage(runtime);
    return { protectionResult, output };
  }

  private async retrieveKnowledge(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Retrieve Knowledge');
    const interpretation = state.interpretation;
    if (!interpretation) {
      throw new Error('Knowledge retrieval requires an interpretation result.');
    }

    const request: RetrievalRequest = {
      query: interpretation.intent,
      usageArea: interpretation.usageArea,
      taskType: interpretation.taskType,
    };
    const retrievalPolicy = retrievalPolicyFor(request.taskType);
    if (retrievalPolicy.action === 'skip') {
      this.logStageCompleted(
        3,
        'Retrieve Knowledge',
        'Fresh knowledge retrieval skipped for a local revision.',
        'Assemble Context',
        {
          usageArea: request.usageArea,
          taskType: request.taskType,
          retrievalPolicy: retrievalPolicy.reason,
          candidateCount: 0,
          rejectedCount: 0,
          eligibleItemCount: 0,
          retrievalRequest: {
            ...request,
            query: this.redactedText(request.query),
          },
          candidateSummary: [],
          eligibleKnowledge: [],
        },
      );
      this.completeStage(runtime);
      return { knowledge: [] };
    }

    // Retrieval returns normalized candidates; it does not construct the final
    // model context. Assemble Context remains responsible for that boundary.
    const candidates = hasExternalCancellation(runtime)
      ? await this.knowledgeRetrievalService.retrieve(request, runtime)
      : await this.knowledgeRetrievalService.retrieve(request);
    throwIfAborted(runtime.signal);
    const { eligibleItems, rejectedCount } =
      this.knowledgeCandidateFilter.filter(candidates, request.usageArea);
    const zeroKnowledgePolicy = zeroKnowledgePolicyFor({
      interpretation,
      eligibleKnowledgeCount: eligibleItems.length,
    });
    const clarifiedInterpretation =
      zeroKnowledgePolicy.action === 'clarify'
        ? {
            ...interpretation,
            needsClarification: true,
            clarification: {
              reason: 'insufficient_context' as const,
              question:
                interpretation.responseLanguage === 'de'
                  ? 'Ich konnte kein freigegebenes Material für diese Anfrage finden. Bitte gib die relevante Quelle an oder grenze die Frage ein.'
                  : "I couldn't find governed material for that request. Please provide the relevant source or narrow the question.",
            },
          }
        : undefined;

    this.logStageCompleted(
      3,
      'Retrieve Knowledge',
      `Knowledge search completed — ${eligibleItems.length} eligible ${eligibleItems.length === 1 ? 'item' : 'items'} selected.`,
      zeroKnowledgePolicy.action === 'clarify'
        ? 'Workflow End'
        : 'Assemble Context',
      {
        usageArea: request.usageArea,
        taskType: request.taskType,
        retrievalPolicy: retrievalPolicy.reason,
        candidateCount: candidates.length,
        rejectedCount,
        eligibleItemCount: eligibleItems.length,
        zeroKnowledgePolicy: zeroKnowledgePolicy.reason,
        retrievalRequest: {
          ...request,
          query: this.redactedText(request.query),
        },
        candidateSummary: candidates.map((candidate) =>
          this.knowledgeItemLogView(candidate),
        ),
        eligibleKnowledge: eligibleItems.map((item) =>
          this.knowledgeItemLogView(item),
        ),
      },
    );

    this.completeStage(runtime);
    return {
      knowledge: eligibleItems,
      zeroKnowledgePolicy,
      ...(clarifiedInterpretation === undefined
        ? {}
        : { interpretation: clarifiedInterpretation }),
    };
  }

  private async assembleContext(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Assemble Context');
    const interpretation = state.interpretation;
    if (!interpretation) {
      throw new Error('Context assembly requires an interpretation result.');
    }

    const committedRules =
      this.committedRuleRetrievalService === undefined
        ? []
        : await this.committedRuleRetrievalService.retrieveApplicable(
            state.ownerUserId,
            interpretation.usageArea,
          );
    throwIfAborted(runtime.signal);

    const input: ContextAssemblyInput = {
      latestUserMessage: state.latestUserMessage ?? '',
      interpretation,
      knowledge: state.knowledge,
      recentMessages: state.recentMessages,
      committedRules,
    };
    const contextPackage = this.contextAssembler.assemble(input);

    this.logStageCompleted(
      4,
      'Assemble Context',
      'Controlled generation context prepared.',
      'Generate Output',
      {
        usageArea: contextPackage.request.usageArea,
        taskType: contextPackage.request.taskType,
        recentMessageCount: contextPackage.conversation.recentMessageCount,
        knowledgeItemCount: contextPackage.knowledge.length,
        compatibleReusableFeedbackCount:
          contextPackage.generationConstraints.reusableFeedback?.rules.length ??
          0,
        constraintCount: Object.keys(contextPackage.generationConstraints)
          .length,
        contextPackage: this.contextPackageLogView(contextPackage),
      },
    );

    this.completeStage(runtime);
    return { contextPackage };
  }

  private async generateOutput(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Generate Output');
    const contextPackage = state.contextPackage;
    if (!contextPackage) {
      throw new Error('Output generation requires a context package.');
    }

    const request: GenerationRequest = {
      contextPackage,
      refinementCount: state.refinementCount,
      ...(state.refinement === undefined
        ? {}
        : { refinement: state.refinement }),
    };
    if (request.refinement !== undefined) {
      this.attributionDiagnostics?.logRefinement(
        request.refinementCount,
        contextPackage,
        request.refinement.verificationFeedback,
      );
    }
    const generationResult = hasExternalCancellation(runtime)
      ? await this.generationService.generate(request, runtime)
      : await this.generationService.generate(request);
    throwIfAborted(runtime.signal);

    this.logStageCompleted(
      5,
      'Generate Output',
      'Generation completed from the controlled context.',
      'Verify Output',
      {
        finishReason: generationResult.finishReason,
        usageArea: contextPackage.request.usageArea,
        taskType: contextPackage.request.taskType,
        knowledgeItemCount: contextPackage.knowledge.length,
        constraintCount: Object.keys(contextPackage.generationConstraints)
          .length,
        outputProduced: true,
        outputCharacterCount: generationResult.content.length,
        model: generationResult.model,
        refinementCount: state.refinementCount,
        generatedOutput: '[redacted from logs]',
      },
    );
    this.completeStage(runtime);
    return { generationResult, refinement: undefined };
  }

  private async verifyOutput(
    state: WorkflowState,
    runtime: Runtime,
  ): Promise<Partial<WorkflowState>> {
    this.beginStage(runtime, 'Verify Output');
    const input: VerificationInput = {
      generationResult: state.generationResult,
      contextPackage: state.contextPackage,
      refinementCount: state.refinementCount,
    };
    let verificationResult = hasExternalCancellation(runtime)
      ? await this.verificationService.verify(input, runtime)
      : await this.verificationService.verify(input);
    throwIfAborted(runtime.signal);
    let refinementCount = state.refinementCount;
    const resolvedGenerationResult =
      verificationResult.resolvedOutput !== undefined &&
      state.generationResult !== undefined
        ? {
            ...state.generationResult,
            content: verificationResult.resolvedOutput,
          }
        : undefined;

    if (verificationResult.decision === 'refine') {
      if (refinementCount >= MAX_REFINEMENT_COUNT) {
        verificationResult = this.refinementLimitRejection(verificationResult);
      } else if (!hasActionableFeedback(verificationResult.feedback)) {
        verificationResult = this.missingFeedbackRejection();
      } else {
        refinementCount += 1;
      }
    }

    const nextStage =
      verificationResult.decision === 'refine'
        ? 'Generate Output'
        : 'Workflow End';

    this.logStageCompleted(
      6,
      'Verify Output',
      this.verificationSummary(verificationResult.decision),
      nextStage,
      {
        verifier: 'semantic',
        decision: verificationResult.decision,
        reasonCodes: verificationResult.reasonCodes,
        issueCount: verificationResult.feedback?.issues.length ?? 0,
        refinementCount,
        attributionFooterApplied: resolvedGenerationResult !== undefined,
      },
    );

    const refinement =
      verificationResult.decision === 'refine' &&
      state.generationResult !== undefined &&
      verificationResult.feedback !== undefined
        ? ({
            previousOutput: state.generationResult.content,
            verificationFeedback: verificationResult.feedback,
          } satisfies GenerationRefinementContext)
        : undefined;

    executionContext(runtime).refinementCount = refinementCount;
    this.completeStage(runtime);
    return {
      verificationResult,
      ...(resolvedGenerationResult === undefined
        ? {}
        : { generationResult: resolvedGenerationResult }),
      refinementCount,
      refinement,
      output:
        verificationResult.decision === 'reject' ? REJECTED_OUTPUT : undefined,
    };
  }

  private refinementLimitRejection(
    result: VerificationResult,
  ): VerificationResult {
    return {
      decision: 'reject',
      reasonCodes: [
        ...result.reasonCodes,
        VerificationReasonCode.RefinementLimitReached,
      ],
      feedback: result.feedback,
    };
  }

  private missingFeedbackRejection(): VerificationResult {
    return {
      decision: 'reject',
      reasonCodes: [VerificationReasonCode.VerificationFailed],
      feedback: {
        issues: [
          {
            code: VerificationReasonCode.VerificationFailed,
            message:
              'Verification requested refinement without actionable feedback.',
          },
        ],
        revisionInstructions: [],
      },
    };
  }

  private verificationSummary(decision: VerificationDecision): string {
    if (decision === 'pass') {
      return 'Output verification passed.';
    }
    if (decision === 'refine') {
      return 'Output needs refinement; generation will run again.';
    }
    return 'Output was rejected by verification.';
  }

  private logStageCompleted(
    stageNumber: number,
    stageName: string,
    summary: string,
    nextStage: string,
    metadata: LogMetadata,
  ): void {
    this.logger.info(
      'workflow.stage.completed',
      `[${stageNumber}/${WORKFLOW_STAGE_COUNT}] ${stageName} — ${summary}`,
      {
        stageNumber,
        totalStageCount: WORKFLOW_STAGE_COUNT,
        stageName,
        nextStage,
        ...metadata,
      },
    );
  }

  private describeOutcome(state: WorkflowState): string {
    if (
      state.feedbackApprovalResolution?.outcome === 'ambiguous' ||
      state.feedbackApprovalResolution?.outcome === 'unclear' ||
      state.feedbackApprovalResolution?.outcome === 'conflict' ||
      state.feedbackApprovalResolution?.outcome === 'conflict_uncertain'
    ) {
      return 'feedback approval requires clarification.';
    }
    if (
      state.feedbackApprovalResolution !== undefined &&
      state.feedbackApprovalResolution.outcome !== 'apply_current'
    ) {
      return 'feedback approval decision recorded.';
    }
    const decision: ProtectionDecision =
      state.protectionResult?.decision ?? 'stop';
    if (decision === 'clarify') {
      return 'clarification requested after Protection Check.';
    }
    if (decision === 'stop') {
      return 'request stopped after Protection Check.';
    }
    if (state.verificationResult?.decision === 'reject') {
      return 'generated output rejected after Verify Output.';
    }
    if (state.refinementCount > 0) {
      return 'refined output passed verification.';
    }
    return 'all 6 stages completed successfully.';
  }

  private contextPackageLogView(contextPackage: ContextPackage): object {
    return {
      request: {
        usageArea: contextPackage.request.usageArea,
        taskType: contextPackage.request.taskType,
        intent: this.redactedText(contextPackage.request.intent),
        latestUserMessage: this.redactedText(
          contextPackage.request.latestUserMessage,
        ),
        refersToPreviousContext: contextPackage.request.refersToPreviousContext,
      },
      conversation: {
        recentMessageCount: contextPackage.conversation.recentMessageCount,
        workingArtifactResolved:
          contextPackage.conversation.workingArtifact !== undefined,
        messages: contextPackage.conversation.recentMessages.map(
          (message, index) => ({
            position: index + 1,
            role: message.role,
            contentType: typeof message.content,
          }),
        ),
      },
      knowledge: contextPackage.knowledge.map((item) =>
        this.knowledgeItemLogView(item),
      ),
      generationConstraints: {
        ...(contextPackage.generationConstraints.policyPlanning === undefined
          ? {}
          : {
              policyPlanning: {
                suppliedFields: Object.keys(
                  contextPackage.generationConstraints.policyPlanning,
                ),
              },
            }),
        knowledge: contextPackage.generationConstraints.knowledge,
        conversation: contextPackage.generationConstraints.conversation,
        reusableFeedback: {
          authority:
            contextPackage.generationConstraints.reusableFeedback?.authority,
          role: contextPackage.generationConstraints.reusableFeedback?.role,
          ruleCount:
            contextPackage.generationConstraints.reusableFeedback?.rules
              .length ?? 0,
        },
        ...(contextPackage.generationConstraints.revision === undefined
          ? {}
          : { revision: contextPackage.generationConstraints.revision }),
        output: contextPackage.generationConstraints.output,
      },
    };
  }

  private redactedText(value: string): string {
    return `[redacted: ${value.length} characters]`;
  }

  private knowledgeItemLogView(item: RetrievedKnowledgeItem): object {
    return {
      id: item.id,
      content: `[redacted: ${item.content.length} characters]`,
      relevanceScore: item.relevanceScore,
      source: item.source,
      status: item.status,
      allowedUsageAreas: item.allowedUsageAreas,
      attributionRequired: item.attributionRequired,
    };
  }

  private beginStage(runtime: Runtime, stage: string): void {
    throwIfAborted(runtime.signal);
    const execution = executionContext(runtime);
    execution.currentStage = stage;
  }

  private completeStage(runtime: Runtime): void {
    executionContext(runtime).completedStageCount += 1;
  }
}

function executionContext(runtime: Runtime): WorkflowExecutionContext {
  const value = runtime.configurable?.workflowExecution;
  if (!isWorkflowExecutionContext(value)) {
    throw new Error('Workflow execution context is missing.');
  }
  return value;
}

function workflowStageFor(stage: string): WorkflowStage {
  const stages: Record<string, WorkflowStage> = {
    'Interpret Input': 'interpret_input',
    'Protection Check': 'protection_check',
    'Retrieve Knowledge': 'retrieve_knowledge',
    'Assemble Context': 'assemble_context',
    'Generate Output': 'generate_output',
    'Verify Output': 'verify_output',
  };
  return stages[stage] ?? 'interpret_input';
}

function failedWorkflowState(
  messages: ChatMessage[],
  failure: ReturnType<typeof createWorkflowFailure>,
): WorkflowState {
  return {
    ownerUserId: undefined,
    messages,
    latestUserMessage: undefined,
    recentMessages: [],
    interpretation: undefined,
    feedbackCandidate: undefined,
    feedbackApprovalResolution: undefined,
    protectionSemanticEvidence: undefined,
    protectionResult: undefined,
    knowledge: [],
    zeroKnowledgePolicy: undefined,
    contextPackage: undefined,
    generationResult: undefined,
    refinement: undefined,
    verificationResult: undefined,
    refinementCount: 0,
    output: undefined,
    outcome: 'failed',
    failure,
  };
}

function hasExternalCancellation(runtime: Runtime): boolean {
  return runtime.configurable?.hasExternalCancellation === true;
}

function feedbackExecutionModeFor(
  interpretation: InterpretationResult,
): FeedbackExecutionMode | undefined {
  if (interpretation.feedbackExecutionMode !== undefined) {
    return interpretation.feedbackExecutionMode;
  }
  return interpretation.feedbackIntent === 'reusable_preference'
    ? undefined
    : 'none';
}

function isValidFeedbackExecutionMode(
  interpretation: InterpretationResult,
  mode: FeedbackExecutionMode | undefined,
): mode is FeedbackExecutionMode {
  if (mode === undefined) return false;
  if (
    interpretation.feedbackIntent !== 'reusable_preference' &&
    mode !== 'none'
  ) {
    return false;
  }
  if (
    interpretation.feedbackIntent === 'reusable_preference' &&
    mode === 'none'
  ) {
    return false;
  }
  if (mode === 'combined_with_current_task') {
    return interpretation.taskType !== 'unknown';
  }
  return true;
}

/** Reuses the original feedback for one revision without saving a future rule. */
function currentDraftFeedbackInterpretation(
  interpretation: InterpretationResult,
  candidate: RuleCandidate,
): InterpretationResult {
  return {
    ...interpretation,
    usageArea: usageAreaForCandidateScope(candidate.scope),
    taskType: 'revision',
    feedbackIntent: 'current_output_feedback',
    feedbackExecutionMode: 'none',
    feedbackApprovalIntent: 'none',
    intent: `Apply this feedback to the current draft: ${candidate.originalFeedback}. Concrete editing constraint: ${candidate.derivedRule ?? candidate.originalFeedback}`,
    refersToPreviousContext: true,
    needsClarification: false,
    clarification: undefined,
    scope: {
      usageAreaResolved: true,
      taskTypeResolved: true,
      conversationReferenceResolved: true,
    },
  };
}

function usageAreaForCandidateScope(
  scope: RuleScope,
): Exclude<UsageArea, 'unknown'> {
  switch (scope) {
    case 'article':
      return 'article';
    case 'digest':
      return 'digest';
    case 'review':
      return 'review';
    default:
      throw new Error(
        'A pending feedback candidate must have a concrete reusable scope.',
      );
  }
}

function isWorkflowExecutionContext(
  value: unknown,
): value is WorkflowExecutionContext {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !('currentStage' in value) ||
    !('completedStageCount' in value) ||
    !('refinementCount' in value)
  ) {
    return false;
  }
  return (
    typeof value.currentStage === 'string' &&
    typeof value.completedStageCount === 'number' &&
    typeof value.refinementCount === 'number'
  );
}

function immediatelyPrecedingApprovalRule(
  messages: readonly ChatMessage[],
): string | undefined {
  const precedingMessage = messages.at(-2);
  return precedingMessage?.role === 'assistant' &&
    typeof precedingMessage.content === 'string'
    ? approvalProposalRule(precedingMessage.content)
    : undefined;
}

function isExplicitSaveConfirmation(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase('en-US');
  if (
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'yep' ||
    normalized === 'yup' ||
    normalized === 'ja' ||
    normalized === 'sí' ||
    normalized === 'si'
  ) {
    return true;
  }
  const affirmative = /^(?:yes|yep|yup|ja|sí|si)\b/u.test(normalized);
  const saveAction =
    /\b(?:save|remember|speicher\w*|merk\w*|guardar|guárd\w*)\b/u.test(
      normalized,
    );
  return affirmative && saveAction;
}

function hasActionableFeedback(
  feedback: VerificationResult['feedback'],
): feedback is NonNullable<VerificationResult['feedback']> {
  return (
    feedback !== undefined &&
    feedback.issues.length > 0 &&
    feedback.revisionInstructions.length > 0 &&
    feedback.issues.every((issue) => issue.message.trim().length > 0) &&
    feedback.revisionInstructions.every(
      (instruction) => instruction.trim().length > 0,
    )
  );
}
