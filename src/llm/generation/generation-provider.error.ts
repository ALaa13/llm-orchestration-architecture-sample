export const GENERATION_PROVIDER_ERROR_CATEGORIES = [
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

export type GenerationProviderErrorCategory =
  (typeof GENERATION_PROVIDER_ERROR_CATEGORIES)[number];

export type GenerationProviderDiagnostics = Readonly<{
  providerErrorName?: string;
  providerStatus?: number;
  providerErrorType?: string;
  providerRequestId?: string;
  providerResponseIssue?: string;
  providerStopReason?: string;
  providerContentBlockTypes?: string;
}>;

/** Stable internal error for failures while producing generated output. */
export class GenerationProviderError extends Error {
  constructor(
    readonly category: GenerationProviderErrorCategory,
    readonly provider: 'anthropic',
    readonly model: string,
    diagnostics: GenerationProviderDiagnostics = {},
  ) {
    super('Generation provider failure: ' + category);
    this.name = 'GenerationProviderError';
    Object.assign(this, diagnostics);
  }
}

/** Internal marker for malformed or unsupported provider responses. */
export class GenerationProviderResponseError extends Error {
  constructor(
    readonly providerResponseIssue?: string,
    readonly providerStopReason?: string,
    readonly providerContentBlockTypes?: string,
  ) {
    super('Anthropic returned an unusable generation response.');
    this.name = 'GenerationProviderResponseError';
  }
}
