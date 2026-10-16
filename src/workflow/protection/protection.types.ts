import type { InterpretationResult } from '../interpretation/interpretation.types';
import type { ProtectionSemanticEvidence } from '../semantic-analysis/semantic-analysis.types';

export type ProtectionDecision = 'continue' | 'clarify' | 'stop';

export enum ProtectionReasonCode {
  InterpretationNeedsClarification = 'INTERPRETATION_NEEDS_CLARIFICATION',
  UnknownUsageArea = 'UNKNOWN_USAGE_AREA',
  EmptyUserMessage = 'EMPTY_USER_MESSAGE',
  RequestScopeUnclear = 'REQUEST_SCOPE_UNCLEAR',
  RequestOperationBlocked = 'REQUEST_OPERATION_BLOCKED',
  InvalidProtectionState = 'INVALID_PROTECTION_STATE',
  ProtectionEvaluatorUnavailable = 'PROTECTION_EVALUATOR_UNAVAILABLE',
  ProtectionEvaluatorInvalidResponse = 'PROTECTION_EVALUATOR_INVALID_RESPONSE',
  ProtectionPassed = 'PROTECTION_PASSED',
}

/** Demo-only reason codes that are not part of the production sample policy. */
export enum MockProtectionReasonCode {
  MockProtectionStop = 'MOCK_PROTECTION_STOP',
}

export type ProtectionResultReasonCode =
  ProtectionReasonCode | MockProtectionReasonCode;

export interface ProtectionResult {
  decision: ProtectionDecision;
  reasonCode: ProtectionResultReasonCode;
  reason: string;
}

/** The deliberately narrow input boundary for protection evaluation. */
export interface ProtectionContext {
  interpretation: InterpretationResult;
  latestUserMessage: string;
  protectionSemanticEvidence: ProtectionSemanticEvidence;
}
