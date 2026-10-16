import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ApplicationConfig } from '../config/configuration';
import { GenerationService } from '../workflow/generation/generation.service';
import { AnthropicGenerationService } from './generation/anthropic-generation.service';
import { MockGenerationService } from './generation/mock-generation.service';
import { selectGenerationService } from './generation/generation-provider-selection';
import { GenerationContextSerializer } from './generation/generation-context-serializer';
import { JsonGenerationContextSerializer } from './generation/json-generation-context-serializer';
import { OpenAISemanticAnalysisService } from './semantic-analysis/openai-semantic-analysis.service';
import { OpenAISemanticVerificationService } from './verification/openai-semantic-verification.service';
import { OPENAI_CLIENT } from './openai-client';
import { OpenAIRuleConflictAnalyzer } from './feedback/openai-rule-conflict-analyzer.service';
import {
  ANTHROPIC_CLIENT,
  type AnthropicGenerationClient,
} from './anthropic-client';

@Module({
  providers: [
    {
      /**
       * Creates the shared SDK client when either OpenAI semantic-analysis or
       * semantic-verification provider is selected; mock-only mode does not
       * initialize an external client.
       */
      provide: OPENAI_CLIENT,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
      ): OpenAI | undefined => {
        const interpretationProvider = config.get(
          'llm.interpretationProvider',
          {
            infer: true,
          },
        );
        const verificationProvider = config.get('llm.verification.provider', {
          infer: true,
        });
        const apiKey = config.get('llm.openAiApiKey', { infer: true });
        return interpretationProvider === 'openai' ||
          verificationProvider === 'openai'
          ? apiKey === undefined
            ? undefined
            : new OpenAI({ apiKey })
          : undefined;
      },
    },
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
      ): AnthropicGenerationClient | undefined => {
        const provider = config.get('llm.generation.provider', {
          infer: true,
        });
        const apiKey = config.get('llm.generation.anthropicApiKey', {
          infer: true,
        });
        return provider === 'anthropic' && apiKey !== undefined
          ? new Anthropic({ maxRetries: 2, apiKey })
          : undefined;
      },
    },
    MockGenerationService,
    JsonGenerationContextSerializer,
    {
      provide: GenerationContextSerializer,
      useExisting: JsonGenerationContextSerializer,
    },
    AnthropicGenerationService,
    OpenAISemanticAnalysisService,
    OpenAISemanticVerificationService,
    OpenAIRuleConflictAnalyzer,
    {
      provide: GenerationService,
      inject: [
        ConfigService,
        MockGenerationService,
        AnthropicGenerationService,
      ],
      useFactory: (
        config: ConfigService<ApplicationConfig, true>,
        mock: MockGenerationService,
        anthropic: AnthropicGenerationService,
      ): GenerationService =>
        selectGenerationService(
          config.get('llm.generation.provider', { infer: true }),
          mock,
          anthropic,
        ),
    },
  ],
  exports: [
    GenerationService,
    OpenAISemanticAnalysisService,
    OpenAISemanticVerificationService,
    OpenAIRuleConflictAnalyzer,
    OPENAI_CLIENT,
  ],
})
export class LlmModule {}
