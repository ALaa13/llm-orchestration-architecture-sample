export const SEMANTIC_VERIFICATION_PROVIDER_ERROR_CATEGORIES = [
  'configuration',
  'timeout',
  'authentication',
  'permission',
  'billing',
  'rate_limit',
  'unavailable',
  'invalid_request',
  'invalid_response',
  'unexpected',
] as const;

export type SemanticVerificationProviderErrorCategory =
  (typeof SEMANTIC_VERIFICATION_PROVIDER_ERROR_CATEGORIES)[number];

export type SemanticVerificationProviderDiagnostics = Readonly<{
  providerErrorName?: string;
  providerErrorCode?: string;
  providerStatus?: number;
  providerErrorType?: string;
  providerRequestId?: string;
  validationIssuePaths?: readonly (readonly (string | number)[])[];
  validationIssueCodes?: readonly string[];
  validationIssueMessages?: readonly string[];
}>;

export class SemanticVerificationProviderError extends Error {
  constructor(
    readonly category: SemanticVerificationProviderErrorCategory,
    readonly provider: 'openai',
    readonly model: string,
    diagnostics: SemanticVerificationProviderDiagnostics = {},
  ) {
    super('Semantic verification provider failure: ' + category);
    this.name = 'SemanticVerificationProviderError';
    Object.assign(this, diagnostics);
  }
}
