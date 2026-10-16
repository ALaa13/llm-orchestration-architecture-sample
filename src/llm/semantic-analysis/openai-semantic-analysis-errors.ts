import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { ZodError } from 'zod';
import {
  type SemanticAnalysisProviderDiagnostics,
  type SemanticAnalysisProviderErrorCategory,
} from './semantic-analysis-provider.error';

/** Maps SDK, response, and combined-contract failures to stable categories. */
export function classifySemanticAnalysisError(
  error: unknown,
): SemanticAnalysisProviderErrorCategory {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return 'invalid_response';
  }
  const name = errorName(error);
  if (name === 'EmptyStructuredOutput' || name.startsWith('Response')) {
    return 'invalid_response';
  }
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
  if (status !== undefined && status >= 400 && status < 500) {
    return 'invalid_request';
  }
  if (
    error instanceof APIConnectionTimeoutError ||
    name.toLowerCase().includes('timeout')
  ) {
    return 'timeout';
  }
  if (error instanceof APIConnectionError) return 'unavailable';
  if (error instanceof APIError && (status ?? 0) >= 500) return 'unavailable';
  return 'unexpected';
}

/** Extracts safe SDK metadata without retaining provider content. */
export function safeSemanticAnalysisProviderDiagnostics(
  error: unknown,
): SemanticAnalysisProviderDiagnostics {
  if (error instanceof ZodError) {
    const issues = error.issues.slice(0, 10);
    return {
      providerErrorName: error.name,
      validationIssuePaths: issues.map((issue) =>
        issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number',
        ),
      ),
      validationIssueCodes: issues.map((issue) => issue.code),
      validationIssueMessages: issues.map((issue) =>
        issue.message.length > 200
          ? `${issue.message.slice(0, 197)}...`
          : issue.message,
      ),
    };
  }
  if (error instanceof APIError) {
    return {
      providerErrorName: error.name,
      providerStatus: statusOf(error),
      providerErrorCode: error.code ?? undefined,
      providerErrorType: error.type,
      providerRequestId: error.requestID ?? undefined,
    };
  }
  const incompleteDiagnostics = incompleteResponseDiagnostics(error);
  return {
    providerErrorName: errorName(error) || undefined,
    ...incompleteDiagnostics,
  };
}

function incompleteResponseDiagnostics(
  error: unknown,
): Pick<SemanticAnalysisProviderDiagnostics, 'incompleteReason' | 'usage'> {
  if (!(error instanceof Error)) return {};
  const candidate = error as Error & {
    incompleteReason?: unknown;
    usage?: unknown;
  };
  return {
    ...(typeof candidate.incompleteReason === 'string'
      ? { incompleteReason: candidate.incompleteReason }
      : {}),
    ...(isUsage(candidate.usage) ? { usage: candidate.usage } : {}),
  };
}

function isUsage(
  value: unknown,
): value is NonNullable<SemanticAnalysisProviderDiagnostics['usage']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => entry === undefined || typeof entry === 'number',
  );
}

function statusOf(error: unknown): number | undefined {
  if (!(error instanceof APIError)) return undefined;
  const status: unknown = error.status;
  return typeof status === 'number' ? status : undefined;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}
