import { type OpenAI } from 'openai';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logging';
import type { ApplicationConfig } from '../../config/configuration';
import type { ConversationContext } from '../../workflow/conversation-context/conversation-context.types';
import { SemanticAnalysisService } from '../../workflow/semantic-analysis/semantic-analysis.service';
import type { CombinedSemanticAnalysisResult } from '../../workflow/semantic-analysis/semantic-analysis.types';
import { SEMANTIC_ANALYSIS_INSTRUCTIONS } from './semantic-analysis-prompt';
import { isControlPlaneAssistantResponse } from '../../workflow/artifacts/control-plane-response';
import {
  SemanticAnalysisProviderError,
  type SemanticAnalysisProviderErrorCategory,
} from './semantic-analysis-provider.error';
import {
  classifySemanticAnalysisError,
  safeSemanticAnalysisProviderDiagnostics,
} from './openai-semantic-analysis-errors';
import {
  buildStrictSemanticAnalysisJsonSchema,
  parseSemanticAnalysisProviderOutput,
} from './openai-semantic-analysis-schema';
import { OPENAI_CLIENT } from '../openai-client';
import {
  createProviderAbortSignal,
  isRequestCancelled,
  RequestCancelledError,
  throwIfAborted,
  type CancellationRuntime,
} from '../../common/cancellation/request-cancellation';

const SEMANTIC_ANALYSIS_REASONING_EFFORT = 'minimal' as const;
const SEMANTIC_ANALYSIS_MAX_OUTPUT_TOKENS = 2048;

/**
 * OpenAI adapter for the single bounded semantic-analysis call shared by
 * Stages 1 and 2.
 */
@Injectable()
export class OpenAISemanticAnalysisService extends SemanticAnalysisService {
  /** Creates an adapter using the configured client and timeout settings. */
  constructor(
    @Inject(OPENAI_CLIENT) private readonly client: OpenAI | undefined,
    private readonly config: ConfigService<ApplicationConfig, true>,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  /** Calls OpenAI, normalizes its wire response, and validates the domain result. */
  async analyze(
    context: ConversationContext,
    runtime?: CancellationRuntime,
  ): Promise<CombinedSemanticAnalysisResult> {
    throwIfAborted(runtime?.signal);
    const model = this.config.get('llm.interpretationModel', { infer: true });
    const timeoutMs = this.config.get('llm.interpretationTimeoutMs', {
      infer: true,
    });
    const startedAt = Date.now();
    let providerStartedAt: number | undefined;
    let providerLatencyMs: number | undefined;

    if (this.client === undefined) {
      throw this.failure('configuration', model, startedAt);
    }

    const providerSignal = createProviderAbortSignal(
      runtime?.signal,
      timeoutMs,
    );
    try {
      providerStartedAt = Date.now();
      const response = await this.client.responses.create(
        {
          model,
          instructions: SEMANTIC_ANALYSIS_INSTRUCTIONS,
          input: this.formatContext(context),
          reasoning: { effort: SEMANTIC_ANALYSIS_REASONING_EFFORT },
          max_output_tokens: SEMANTIC_ANALYSIS_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: 'json_schema',
              name: 'semantic_analysis_result',
              schema: buildStrictSemanticAnalysisJsonSchema(),
              strict: true,
            },
          },
        },
        { signal: providerSignal.signal },
      );
      providerLatencyMs = Date.now() - providerStartedAt;
      throwIfAborted(runtime?.signal);

      this.ensureCompletedResponse(response);
      const parsedJson: unknown = JSON.parse(response.output_text);
      const parsed = parseSemanticAnalysisProviderOutput(parsedJson);
      const artifactIndex = parsed.interpretation.workingArtifactMessageIndex;
      if (artifactIndex !== undefined) {
        const artifact = context.recentMessages[artifactIndex];
        if (
          artifact?.role !== 'assistant' ||
          typeof artifact.content !== 'string' ||
          artifact.content.trim() === '' ||
          isControlPlaneAssistantResponse(artifact.content)
        ) {
          throw new Error('Invalid working artifact reference');
        }
      }
      if (
        parsed.interpretation.taskType === 'revision' &&
        artifactIndex === undefined
      ) {
        parsed.interpretation = {
          ...parsed.interpretation,
          refersToPreviousContext: true,
          needsClarification: true,
          scope: {
            ...parsed.interpretation.scope,
            conversationReferenceResolved: false,
          },
          clarification: {
            reason: 'conversation_reference',
            question:
              parsed.interpretation.responseLanguage === 'de'
                ? 'Welchen Entwurf soll ich überarbeiten? Bitte füge den gewünschten Text ein.'
                : 'Which draft should I revise? Please provide the text you want edited.',
          },
        };
      }
      this.logger.info(
        'semantic_analysis.provider.completed',
        'OpenAI semantic analysis completed.',
        {
          provider: 'openai',
          model,
          latencyMs: Date.now() - startedAt,
          providerLatencyMs,
          outcome: 'success',
          validationOutcome: 'valid',
          usage: response.usage
            ? {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                reasoningTokens:
                  response.usage.output_tokens_details.reasoning_tokens,
              }
            : undefined,
        },
      );
      return parsed;
    } catch (error: unknown) {
      if (isRequestCancelled(error, runtime?.signal)) {
        this.logger.info(
          'provider.cancelled',
          'OpenAI semantic analysis was cancelled.',
          {
            provider: 'openai',
            model,
            latencyMs: Date.now() - startedAt,
            outcome: 'cancelled',
          },
        );
        throw new RequestCancelledError();
      }
      const category = providerSignal.didTimeout()
        ? 'timeout'
        : classifySemanticAnalysisError(error);
      throw this.failure(
        category,
        model,
        startedAt,
        error,
        providerLatencyMs ??
          (providerStartedAt === undefined
            ? undefined
            : Date.now() - providerStartedAt),
      );
    } finally {
      providerSignal.dispose();
    }
  }

  /** Serializes only the bounded Stage 1 context allowed by the contract. */
  private formatContext(context: ConversationContext): string {
    return JSON.stringify({
      latestUserMessage: context.latestUserMessage,
      conversationOpening: context.recentMessages
        .slice(0, 2)
        .map((message) => ({
          role: message.role,
          content:
            typeof message.content === 'string'
              ? message.content
              : '[non-text content omitted]',
        })),
      recentMessages: context.recentMessages.map((message, messageIndex) => ({
        messageIndex,
        role: message.role,
        content:
          typeof message.content === 'string'
            ? message.content
            : '[non-text content omitted]',
      })),
      messageCount: context.messageCount,
    });
  }

  /** Rejects incomplete or empty Responses API results before JSON parsing. */
  private ensureCompletedResponse(response: {
    status?: string;
    output_text: string;
    incomplete_details?: { reason?: string | null } | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      output_tokens_details?: { reasoning_tokens?: number | null };
    };
  }): void {
    if (response.status !== undefined && response.status !== 'completed') {
      const incomplete = new Error('OpenAI response was not completed.');
      incomplete.name = `Response${response.status[0].toUpperCase()}${response.status.slice(1)}`;
      Object.assign(incomplete, {
        incompleteReason: response.incomplete_details?.reason ?? undefined,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              reasoningTokens:
                response.usage.output_tokens_details?.reasoning_tokens ??
                undefined,
            }
          : undefined,
      });
      throw incomplete;
    }
    if (response.output_text.trim() === '') {
      const emptyOutput = new Error(
        'OpenAI response contained no output text.',
      );
      emptyOutput.name = 'EmptyStructuredOutput';
      throw emptyOutput;
    }
  }

  /** Logs safe diagnostics and creates the normalized provider error. */
  private failure(
    category: SemanticAnalysisProviderErrorCategory,
    model: string,
    startedAt: number,
    error?: unknown,
    providerLatencyMs?: number,
  ): SemanticAnalysisProviderError {
    const diagnostics = safeSemanticAnalysisProviderDiagnostics(error);
    this.logger.warn(
      'semantic_analysis.provider.failed',
      'OpenAI semantic analysis failed.',
      {
        provider: 'openai',
        model,
        latencyMs: Date.now() - startedAt,
        ...(providerLatencyMs === undefined ? {} : { providerLatencyMs }),
        outcome: 'failure',
        validationOutcome:
          category === 'invalid_response' ? 'invalid' : 'not_completed',
        failureCategory: category,
        ...diagnostics,
      },
    );
    return new SemanticAnalysisProviderError(
      category,
      'openai',
      model,
      diagnostics,
    );
  }
}

export {
  buildStrictSemanticAnalysisJsonSchema,
  parseSemanticAnalysisProviderOutput,
} from './openai-semantic-analysis-schema';
