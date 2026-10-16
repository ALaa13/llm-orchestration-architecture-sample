import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import {
  GenerationProviderResponseError,
  type GenerationProviderDiagnostics,
  type GenerationProviderErrorCategory,
} from './generation-provider.error';

export function classifyGenerationError(
  error: unknown,
): GenerationProviderErrorCategory {
  if (error instanceof GenerationProviderResponseError) {
    return 'invalid_response';
  }
  if (error instanceof APIConnectionTimeoutError) return 'timeout';
  if (error instanceof AuthenticationError || statusOf(error) === 401) {
    return 'authentication';
  }
  if (error instanceof PermissionDeniedError || statusOf(error) === 403) {
    return 'permission';
  }
  if (statusOf(error) === 402) return 'billing';
  if (error instanceof RateLimitError || statusOf(error) === 429) {
    return 'rate_limit';
  }
  const status = statusOf(error);
  if (status !== undefined && [400, 404, 422].includes(status)) {
    return 'invalid_request';
  }
  if (error instanceof APIConnectionError) return 'unavailable';
  if (error instanceof APIError && (status ?? 0) >= 500) {
    return 'unavailable';
  }
  return 'unexpected';
}

export function safeGenerationProviderDiagnostics(
  error: unknown,
): GenerationProviderDiagnostics {
  if (error instanceof GenerationProviderResponseError) {
    return {
      providerErrorName: error.name,
      providerResponseIssue: error.providerResponseIssue,
      providerStopReason: error.providerStopReason,
      providerContentBlockTypes: error.providerContentBlockTypes,
    };
  }
  if (error instanceof APIError) {
    return {
      providerErrorName: error.name,
      providerStatus: statusOf(error),
      providerErrorType: error.type ?? undefined,
      providerRequestId: error.requestID ?? undefined,
    };
  }
  return {
    providerErrorName: error instanceof Error ? error.name : undefined,
  };
}

function statusOf(error: unknown): number | undefined {
  if (!(error instanceof APIError)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}
