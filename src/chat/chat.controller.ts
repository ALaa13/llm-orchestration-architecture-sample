import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppLogger } from '../common/logging';
import {
  createRequestCancellation,
  isRequestCancelled,
} from '../common/cancellation/request-cancellation';
import { LibreChatAuthGuard } from '../common/guards';
import { ZodValidationPipe } from '../common/validation';
import { ChatService } from './chat.service';
import {
  type ChatCompletionRequest,
  chatCompletionRequestOpenApiSchema,
  chatCompletionRequestSchema,
} from './dto/chat-completion-request.schema';
import { waitForDrainOrClose } from './stream-backpressure';
import type { ChatCompletionResponse } from './types/chat-completion.types';

type ResponseStreamPhase = 'pending' | 'working' | 'releasing' | 'completed';

/** Transport boundary reserved for authenticated, streaming chat operations. */
@ApiTags('chat')
@Controller('v1/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly logger: AppLogger,
  ) {}

  @Post('completions')
  @HttpCode(200)
  @UseGuards(LibreChatAuthGuard)
  @ApiOperation({ summary: 'Acknowledge an OpenAI-compatible chat request' })
  @ApiBody({ schema: chatCompletionRequestOpenApiSchema })
  /** Handles JSON responses and verified-content SSE responses at the HTTP boundary. */
  async createCompletion(
    @Req() requestObject: Request,
    @Body(new ZodValidationPipe(chatCompletionRequestSchema))
    request: ChatCompletionRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChatCompletionResponse | void> {
    const streamStartedAt = Date.now();
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let firstByteLatency: number | undefined;
    let phase: ResponseStreamPhase = 'pending';
    const cancellation = createRequestCancellation(
      requestObject,
      response,
      () => {
        this.logger.info(
          'request.cancelled',
          'Client disconnected before request completion.',
        );
      },
    );

    try {
      if (request.stream !== true) {
        const acknowledgement = await this.chatService.createAcknowledgement(
          request,
          cancellation,
        );
        cancellation.complete();
        return acknowledgement.completion;
      }

      // Transport streaming is deliberately separate from model streaming:
      // this opens the SSE connection early, but no provider token is written.
      // Stage 5 output remains inside the workflow until Stage 6 approves it.
      // LibreChat v0.8.7 does not expose a separate temporary progress channel
      // for custom OpenAI-compatible endpoints. Arbitrary progress events or
      // reasoning fields would either be ignored or become assistant content,
      // so workflow status stays in backend logs and the ordinary LibreChat
      // submitting state remains the only compatible progress indication.
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      phase = 'working';
      this.logger.info('response.stream.opened', 'SSE response opened.');

      // A comment is valid SSE, invisible to LibreChat, and gives proxies a
      // first byte without inventing assistant content or a custom event.
      if (
        cancellation.isCancelled() ||
        !(await this.writeSse(response, ': keepalive\n\n'))
      )
        return;
      firstByteLatency = Date.now() - streamStartedAt;
      keepalive = setInterval(() => {
        if (
          response.destroyed ||
          response.writableEnded ||
          response.writableNeedDrain ||
          cancellation.isCancelled()
        )
          return;
        try {
          response.write(': keepalive\n\n');
        } catch {
          this.logger.warn(
            'response.stream.closed',
            'SSE keepalive write was unavailable.',
          );
        }
      }, 15_000);
      keepalive.unref();

      let acknowledgement;
      try {
        acknowledgement = await this.chatService.createAcknowledgement(
          request,
          cancellation,
        );
      } catch (error: unknown) {
        if (isRequestCancelled(error, cancellation.signal)) return;
        this.logger.error(
          'response.stream.failed',
          'SSE workflow failed after headers were sent.',
        );
        acknowledgement =
          this.chatService.createFailureAcknowledgement(request);
      }

      try {
        phase = 'releasing';
        for (const chunk of acknowledgement.chunks) {
          if (
            response.destroyed ||
            response.writableEnded ||
            cancellation.isCancelled()
          ) {
            return;
          }

          if (
            !(await this.writeSse(
              response,
              `data: ${JSON.stringify(chunk)}\n\n`,
            ))
          ) {
            return;
          }
        }

        if (
          !response.destroyed &&
          !response.writableEnded &&
          !cancellation.isCancelled()
        ) {
          cancellation.complete();
          response.end('data: [DONE]\n\n');
          phase = 'completed';
          this.logger.info(
            'response.stream.completed',
            'SSE response completed.',
            {
              outcome: acknowledgement.outcome,
              phase,
              chunkCount: acknowledgement.chunks.length,
              firstByteLatency,
              finalReleaseLatency: Date.now() - streamStartedAt,
            },
          );
        }
      } catch (error: unknown) {
        if (isRequestCancelled(error, cancellation.signal)) return;
        this.logger.error(
          'response.stream.failed',
          'SSE write failed after headers were sent.',
        );
        if (!response.destroyed && !response.writableEnded) {
          // A transport failure may follow partial content. Do not append a
          // different answer or mark the interrupted stream as complete.
          response.destroy();
        }
      }
    } catch (error: unknown) {
      if (isRequestCancelled(error, cancellation.signal)) {
        this.logger.info(
          'response.stream.closed',
          'SSE response closed after client cancellation.',
        );
        return;
      }
      throw error;
    } finally {
      if (keepalive !== undefined) clearInterval(keepalive);
      cancellation.dispose();
    }
  }

  /** Writes one SSE frame while honoring response closure and backpressure. */
  private async writeSse(response: Response, data: string): Promise<boolean> {
    if (response.destroyed || response.writableEnded) return false;
    if (response.write(data)) return true;
    return waitForDrainOrClose(response);
  }
}
