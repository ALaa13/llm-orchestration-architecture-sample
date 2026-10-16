import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfig } from '../config/configuration';
import { LlmModule } from '../llm/llm.module';
import { OpenAISemanticAnalysisService } from '../llm/semantic-analysis/openai-semantic-analysis.service';
import { ContextAssembler } from './context-assembly/context-assembler.service';
import { ConversationContextBuilder } from './conversation-context/conversation-context.builder';
import { InterpretationService } from './interpretation/interpretation.service';
import { SemanticAnalysisInterpretationService } from './interpretation/semantic-analysis-interpretation.service';
import { DeterministicProtectionChecks } from './protection/deterministic-protection-checks';
import { ProtectionService } from './protection/protection.service';
import { KnowledgeCandidateFilter } from './retrieval/knowledge-candidate-filter';
import { KnowledgeRetrievalService } from './retrieval/knowledge-retrieval.service';
import { MockKnowledgeRetrievalService } from './retrieval/mock-knowledge-retrieval.service';
import { KnowledgeCenterRetrievalService } from './retrieval/knowledge-center-retrieval.service';
import { selectKnowledgeRetrievalService } from './retrieval/knowledge-retrieval-provider-selection';
import { MockSemanticAnalysisService } from './semantic-analysis/mock-semantic-analysis.service';
import { SemanticAnalysisService } from './semantic-analysis/semantic-analysis.service';
import { DeterministicVerificationChecks } from './verification/deterministic-verification-checks';
import { MockSemanticVerificationService } from './verification/mock-semantic-verification.service';
import { SemanticVerificationService } from './verification/semantic-verification.service';
import { selectSemanticVerificationService } from './verification/semantic-verification-provider-selection';
import { OpenAISemanticVerificationService } from '../llm/verification/openai-semantic-verification.service';
import { VerificationService } from './verification/verification.service';
import { AttributionDiagnosticsService } from './verification/attribution-diagnostics.service';
import { WorkflowService } from './workflow.service';
import {
  FeedbackAnalyzer,
  DeterministicFeedbackAnalyzer,
} from './feedback/feedback-analyzer.service';
import { FeedbackApprovalService } from './feedback/feedback-approval.service';
import { ControlledWriteService } from './feedback/controlled-write.service';
import { CommittedRuleRetrievalService } from './feedback/committed-rule-retrieval.service';
import { CommittedRuleCache } from './feedback/committed-rule.cache';
import { RuleConflictAnalyzer } from './feedback/rule-conflict-analyzer.service';
import { MockRuleConflictAnalyzer } from './feedback/mock-rule-conflict-analyzer.service';
import { OpenAIRuleConflictAnalyzer } from '../llm/feedback/openai-rule-conflict-analyzer.service';
import { RuleConflictService } from './feedback/rule-conflict.service';
import { WorkingArtifactResolver } from './artifacts/working-artifact.resolver';
import { PolicyFeedbackCompatibilityService } from './feedback/policy-feedback-compatibility.service';

@Module({
  imports: [LlmModule],
  providers: [
    ContextAssembler,
    WorkingArtifactResolver,
    ConversationContextBuilder,
    MockSemanticAnalysisService,
    {
      provide: SemanticAnalysisService,
      inject: [
        ConfigService,
        MockSemanticAnalysisService,
        OpenAISemanticAnalysisService,
      ],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
        mock: MockSemanticAnalysisService,
        openAi: OpenAISemanticAnalysisService,
      ): SemanticAnalysisService =>
        config.get('llm.interpretationProvider', { infer: true }) === 'openai'
          ? openAi
          : mock,
    },
    SemanticAnalysisInterpretationService,
    {
      provide: InterpretationService,
      useExisting: SemanticAnalysisInterpretationService,
    },
    DeterministicProtectionChecks,
    ProtectionService,
    KnowledgeCandidateFilter,
    MockKnowledgeRetrievalService,
    KnowledgeCenterRetrievalService,
    {
      provide: KnowledgeRetrievalService,
      inject: [
        ConfigService,
        MockKnowledgeRetrievalService,
        KnowledgeCenterRetrievalService,
      ],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
        mock: MockKnowledgeRetrievalService,
        knowledgeCenter: KnowledgeCenterRetrievalService,
      ): KnowledgeRetrievalService =>
        selectKnowledgeRetrievalService(
          config.get('knowledgeRetrieval.provider', { infer: true }),
          mock,
          knowledgeCenter,
        ),
    },
    DeterministicVerificationChecks,
    AttributionDiagnosticsService,
    MockSemanticVerificationService,
    {
      provide: SemanticVerificationService,
      inject: [
        ConfigService,
        MockSemanticVerificationService,
        OpenAISemanticVerificationService,
      ],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
        mock: MockSemanticVerificationService,
        openAi: OpenAISemanticVerificationService,
      ): SemanticVerificationService =>
        selectSemanticVerificationService(
          config.get('llm.verification.provider', { infer: true }),
          mock,
          openAi,
        ),
    },
    VerificationService,
    WorkflowService,
    DeterministicFeedbackAnalyzer,
    { provide: FeedbackAnalyzer, useExisting: DeterministicFeedbackAnalyzer },
    FeedbackApprovalService,
    ControlledWriteService,
    CommittedRuleCache,
    MockRuleConflictAnalyzer,
    {
      provide: RuleConflictAnalyzer,
      inject: [
        ConfigService,
        MockRuleConflictAnalyzer,
        OpenAIRuleConflictAnalyzer,
      ],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
        mock: MockRuleConflictAnalyzer,
        openAi: OpenAIRuleConflictAnalyzer,
      ): RuleConflictAnalyzer =>
        config.get('llm.interpretationProvider', { infer: true }) === 'openai'
          ? openAi
          : mock,
    },
    RuleConflictService,
    CommittedRuleRetrievalService,
    PolicyFeedbackCompatibilityService,
  ],
  exports: [WorkflowService, ControlledWriteService],
})
export class WorkflowModule {}
