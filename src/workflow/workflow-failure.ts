export const WORKFLOW_FAILURE_CATEGORIES = [
  'configuration',
  'timeout',
  'authentication',
  'permission',
  'billing',
  'rate_limit',
  'unavailable',
  'invalid_request',
  'invalid_response',
  'retrieval_failure',
  'context_assembly_failure',
  'internal_error',
] as const;

export type WorkflowFailureCategory =
  (typeof WORKFLOW_FAILURE_CATEGORIES)[number];

export type WorkflowStage =
  | 'interpret_input'
  | 'protection_check'
  | 'retrieve_knowledge'
  | 'assemble_context'
  | 'generate_output'
  | 'verify_output';

export interface WorkflowFailure {
  readonly stage: WorkflowStage;
  readonly category: WorkflowFailureCategory;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly causeClass: string;
}

export type WorkflowOutcome =
  'pass' | 'clarify' | 'reject' | 'cancelled' | 'failed';

const RETRYABLE_CATEGORIES = new Set<WorkflowFailureCategory>([
  'timeout',
  'rate_limit',
  'unavailable',
]);

export function createWorkflowFailure(
  stage: WorkflowStage,
  error: unknown,
  requestId?: string,
  categoryOverride?: WorkflowFailureCategory,
): WorkflowFailure {
  const category = categoryOverride ?? categoryFromError(error);
  return {
    stage,
    category,
    retryable: RETRYABLE_CATEGORIES.has(category),
    ...(requestId === undefined ? {} : { requestId }),
    causeClass: causeClassOf(error),
  };
}

export function isWorkflowFailure(value: unknown): value is WorkflowFailure {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'stage' in value &&
    'category' in value &&
    'retryable' in value &&
    'causeClass' in value &&
    typeof value.stage === 'string' &&
    typeof value.category === 'string' &&
    typeof value.retryable === 'boolean' &&
    typeof value.causeClass === 'string'
  );
}

function categoryFromError(error: unknown): WorkflowFailureCategory {
  if (isCategorizedError(error)) {
    return WORKFLOW_FAILURE_CATEGORIES.includes(
      error.category as WorkflowFailureCategory,
    )
      ? (error.category as WorkflowFailureCategory)
      : 'internal_error';
  }
  return 'internal_error';
}

function causeClassOf(error: unknown): string {
  return error instanceof Error && error.name.trim() !== ''
    ? error.name
    : 'UnknownError';
}

function isCategorizedError(error: unknown): error is { category: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    typeof error.category === 'string'
  );
}
