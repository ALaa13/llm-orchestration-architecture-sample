import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenAI } from 'openai';
import type { ApplicationConfig } from '../../config/configuration';
import { AppLogger } from '../../common/logging';
import { RuleConflictAnalyzer } from '../../workflow/feedback/rule-conflict-analyzer.service';
import type {
  RuleConflictAnalysis,
  RuleConflictAnalysisInput,
} from '../../workflow/feedback/rule-conflict.types';
import { OPENAI_CLIENT } from '../openai-client';
import { RULE_CONFLICT_INSTRUCTIONS } from './rule-conflict-prompt';
import {
  buildStrictRuleConflictJsonSchema,
  parseRuleConflictProviderOutput,
} from './openai-rule-conflict-schema';

@Injectable()
export class OpenAIRuleConflictAnalyzer extends RuleConflictAnalyzer {
  constructor(
    @Inject(OPENAI_CLIENT) private readonly client: OpenAI | undefined,
    private readonly config: ConfigService<ApplicationConfig, true>,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async analyze(
    input: RuleConflictAnalysisInput,
  ): Promise<RuleConflictAnalysis> {
    const model = this.config.get('llm.interpretationModel', { infer: true });
    const timeoutMs = this.config.get('llm.interpretationTimeoutMs', {
      infer: true,
    });
    if (this.client === undefined) {
      throw new Error('OpenAI rule conflict analyzer is not configured.');
    }

    const startedAt = Date.now();
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await this.client.responses.create(
        {
          model,
          instructions: RULE_CONFLICT_INSTRUCTIONS,
          input: JSON.stringify(input),
          reasoning: { effort: 'minimal' },
          max_output_tokens: 1024,
          text: {
            format: {
              type: 'json_schema',
              name: 'rule_conflict_analysis',
              schema: buildStrictRuleConflictJsonSchema(),
              strict: true,
            },
          },
        },
        { signal },
      );
      if (
        (response.status !== undefined && response.status !== 'completed') ||
        response.output_text.trim() === ''
      ) {
        throw new Error('OpenAI rule conflict response was not completed.');
      }
      const result = parseRuleConflictProviderOutput(
        JSON.parse(response.output_text) as unknown,
      );
      this.logger.info(
        'rule_conflict.provider.completed',
        'OpenAI rule conflict analysis completed.',
        {
          provider: 'openai',
          model,
          latencyMs: Date.now() - startedAt,
          outcome: 'success',
          relationship: result.relationship,
          relatedRuleCount: result.relatedRuleIds.length,
        },
      );
      return result;
    } catch (error: unknown) {
      this.logger.warn(
        'rule_conflict.provider.failed',
        'OpenAI rule conflict analysis failed.',
        {
          provider: 'openai',
          model,
          latencyMs: Date.now() - startedAt,
          outcome: 'failure',
          causeClass: error instanceof Error ? error.name : 'UnknownError',
        },
      );
      throw new Error('Semantic rule conflict analysis failed.', {
        cause: error,
      });
    }
  }
}
