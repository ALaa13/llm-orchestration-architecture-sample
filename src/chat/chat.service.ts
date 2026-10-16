import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../common/logging';
import type { CancellationRuntime } from '../common/cancellation/request-cancellation';
import { isRequestCancelled } from '../common/cancellation/request-cancellation';
import { WorkflowService } from '../workflow/workflow.service';
import type { WorkflowOutcome } from '../workflow/workflow-failure';
import type { ChatCompletionRequest } from './dto/chat-completion-request.schema';
import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
} from './types/chat-completion.types';
import {
  mapWorkflowResponse,
  unexpectedFailureMessage,
} from './user-facing-response';

/** Orchestrates requests without owning conversation or message persistence. */
@Injectable()
export class ChatService {
  constructor(
    private readonly logger: AppLogger,
    private readonly workflowService: WorkflowService,
  ) {}

  /** Runs the workflow and builds identical final JSON and SSE representations. */
  async createAcknowledgement(
    request: ChatCompletionRequest,
    runtime?: CancellationRuntime,
  ): Promise<{
    completion: ChatCompletionResponse;
    chunks: ChatCompletionChunk[];
    outcome: WorkflowOutcome | undefined;
  }> {
    this.logger.info(
      'chat.request.received',
      'LibreChat completion request received',
      {
        model: request.model,
        messageCount: request.messages.length,
        stream: request.stream === true,
      },
    );

    // Pass the request-scoped LibreChat history through without persisting it.
    // ConversationContextBuilder owns the smaller window used for interpretation.
    let workflowState: Awaited<ReturnType<WorkflowService['run']>>;
    try {
      workflowState =
        runtime === undefined && request.user === undefined
          ? await this.workflowService.run(request.messages)
          : await this.workflowService.run(
              request.messages,
              runtime,
              request.user,
            );
    } catch (error: unknown) {
      if (isRequestCancelled(error, runtime?.signal)) throw error;
      this.logger.error(
        'chat.workflow.failed',
        'Chat workflow failed at the boundary.',
      );
      return this.createFailureAcknowledgement(request);
    }
    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    // Generated content is held on GenerationResult. Safe terminal
    // protection and verification-rejection responses live in output.
    const userFacingMessage = mapWorkflowResponse(workflowState);
    const generatedContent =
      workflowState.generationResult?.content ?? workflowState.output ?? '';
    const content =
      userFacingMessage?.placement === 'append'
        ? [generatedContent, userFacingMessage.message]
            .filter((part) => part.length > 0)
            .join('\n\n')
        : (userFacingMessage?.message ?? generatedContent);

    return {
      completion: {
        id,
        object: 'chat.completion',
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      },
      chunks: [
        {
          id,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content },
              finish_reason: null,
            },
          ],
        },
        {
          id,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ],
      outcome: workflowState.outcome,
    };
  }

  /** Builds the safe fallback returned when the workflow boundary fails unexpectedly. */
  createFailureAcknowledgement(request: ChatCompletionRequest): {
    completion: ChatCompletionResponse;
    chunks: ChatCompletionChunk[];
    outcome: 'failed';
  } {
    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const content = unexpectedFailureMessage().message;
    return {
      completion: {
        id,
        object: 'chat.completion',
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      },
      chunks: [
        {
          id,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content },
              finish_reason: null,
            },
          ],
        },
        {
          id,
          object: 'chat.completion.chunk',
          created,
          model: request.model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ],
      outcome: 'failed',
    };
  }
}
