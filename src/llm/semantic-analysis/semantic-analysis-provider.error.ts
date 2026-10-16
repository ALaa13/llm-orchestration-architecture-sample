/** Stable failure categories exposed by provider adapters to orchestration. */
export const SEMANTIC_ANALYSIS_PROVIDER_ERROR_CATEGORIES = [
  'configuration',
  'timeout',
  'rate_limit',
  'authentication',
  'permission',
  'billing',
  'unavailable',
  'invalid_request',
  'invalid_response',
  'unexpected',
] as const;

export type SemanticAnalysisProviderErrorCategory =
  (typeof SEMANTIC_ANALYSIS_PROVIDER_ERROR_CATEGORIES)[number];

export type SemanticAnalysisProviderDiagnostics = Readonly<{
  providerErrorName?: string;
  providerStatus?: number;
  providerErrorCode?: string;
  providerErrorType?: string;
  providerRequestId?: string;
  incompleteReason?: string;
  usage?: Readonly<{
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  }>;
  validationIssuePaths?: readonly (readonly (string | number)[])[];
  validationIssueCodes?: readonly string[];
  validationIssueMessages?: readonly string[];
}>;

/**
 * Stable internal error for failures while producing semantic analysis.
 *
 * The category is safe for orchestration and logging; raw provider details are
 * deliberately not retained or exposed.
 */
export class SemanticAnalysisProviderError extends Error {
  /** Creates a normalized error without retaining the provider response body. */
  constructor(
    readonly category: SemanticAnalysisProviderErrorCategory,
    readonly provider: 'openai',
    readonly model: string,
    diagnostics: SemanticAnalysisProviderDiagnostics = {},
  ) {
    super('Semantic analysis provider failure: ' + category);
    this.name = 'SemanticAnalysisProviderError';
    Object.assign(this, diagnostics);
  }
}
