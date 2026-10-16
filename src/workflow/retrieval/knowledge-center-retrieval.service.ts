import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  createProviderAbortSignal,
  isRequestCancelled,
  RequestCancelledError,
  throwIfAborted,
  type CancellationRuntime,
} from '../../common/cancellation/request-cancellation';
import type { ApplicationConfig } from '../../config/configuration';
import { KnowledgeCenterRetrievalError } from './knowledge-center-retrieval.error';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { CONTEXT_BINDINGS, KNOWLEDGE_STATUSES } from './retrieval.types';
import type {
  RetrievalRequest,
  RetrievedKnowledgeItem,
} from './retrieval.types';

const knowledgeSearchItemSchema = z
  .object({
    id: z.string().trim().min(1),
    candidateId: z.string(),
    candidateVersionId: z.string(),
    knowledgeStatus: z.enum(KNOWLEDGE_STATUSES),
    contextBinding: z.enum(CONTEXT_BINDINGS),
    provenanceRefs: z.array(
      z
        .object({
          sourceId: z.string(),
          sourceTitle: z.string(),
          sourceVersionId: z.string(),
          sourceSegmentId: z.string(),
          sourceSegmentVersionId: z.string(),
          relationRole: z.string(),
        })
        .strict(),
    ),
    content: z.string().trim().min(1),
    relevanceScore: z.number().finite(),
    source: z
      .object({
        id: z.string().trim().min(1),
        title: z.string().trim().min(1).optional(),
      })
      .strict(),
    status: z.enum(['approved', 'quarantined']),
    allowedUsageAreas: z.array(z.enum(['article', 'digest', 'review'])),
    attributionRequired: z.boolean(),
  })
  .strict()
  .refine((item) => item.id === item.candidateVersionId, {
    message: 'KC id must equal candidateVersionId',
    path: ['candidateVersionId'],
  });

const knowledgeSearchResponseSchema = z
  .object({
    query: z.string(),
    items: z.array(knowledgeSearchItemSchema),
  })
  .strict();

/** HTTP adapter for the KC's governed, read-only knowledge-search endpoint. */
@Injectable()
export class KnowledgeCenterRetrievalService extends KnowledgeRetrievalService {
  constructor(private readonly config: ConfigService<ApplicationConfig, true>) {
    super();
  }

  async retrieve(
    request: RetrievalRequest,
    runtime?: CancellationRuntime,
  ): Promise<RetrievedKnowledgeItem[]> {
    throwIfAborted(runtime?.signal);
    const url = this.config.get('knowledgeRetrieval.knowledgeCenterUrl', {
      infer: true,
    });
    const sharedKey = this.config.get('knowledgeRetrieval.sharedKey', {
      infer: true,
    });
    const timeoutMs = this.config.get('knowledgeRetrieval.timeoutMs', {
      infer: true,
    });
    const limit = this.config.get('knowledgeRetrieval.limit', { infer: true });

    if (url === undefined || sharedKey === undefined) {
      throw new KnowledgeCenterRetrievalError('configuration');
    }

    const providerSignal = createProviderAbortSignal(
      runtime?.signal,
      timeoutMs,
    );
    try {
      const response = await fetch(
        new URL('/sample/knowledge/search', url),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-architecture-sample-key': sharedKey,
          },
          body: JSON.stringify({ ...request, limit }),
          signal: providerSignal.signal,
        },
      );
      throwIfAborted(runtime?.signal);

      if (!response.ok) {
        throw new KnowledgeCenterRetrievalError(
          categoryForStatus(response.status),
        );
      }

      const parsed = knowledgeSearchResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success || parsed.data.query !== request.query) {
        throw new KnowledgeCenterRetrievalError('invalid_response');
      }
      return parsed.data.items;
    } catch (error: unknown) {
      if (isRequestCancelled(error, runtime?.signal)) {
        throw new RequestCancelledError();
      }
      if (error instanceof KnowledgeCenterRetrievalError) throw error;
      throw new KnowledgeCenterRetrievalError(
        providerSignal.didTimeout() ? 'timeout' : 'unavailable',
      );
    } finally {
      providerSignal.dispose();
    }
  }
}

function categoryForStatus(
  status: number,
): KnowledgeCenterRetrievalError['category'] {
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 401) return 'authentication';
  if (status === 403) return 'permission';
  if (status >= 500) return 'unavailable';
  return 'invalid_response';
}
