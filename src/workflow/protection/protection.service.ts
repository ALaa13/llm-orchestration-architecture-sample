import { Injectable } from '@nestjs/common';
import { DeterministicProtectionChecks } from './deterministic-protection-checks';
import {
  MockProtectionReasonCode,
  ProtectionReasonCode,
  type ProtectionContext,
  type ProtectionDecision,
  type ProtectionResult,
  type ProtectionResultReasonCode,
} from './protection.types';

export interface ProtectionEvaluation {
  result: ProtectionResult;
  deterministicResult?: ProtectionResult;
  deterministicResults: ProtectionResult[];
  semanticEvidenceResult?: ProtectionResult;
}

const DECISION_PRECEDENCE: Record<ProtectionDecision, number> = {
  continue: 0,
  clarify: 1,
  stop: 2,
};

const REASON_PRECEDENCE: Record<ProtectionResultReasonCode, number> = {
  [ProtectionReasonCode.RequestOperationBlocked]: 900,
  [MockProtectionReasonCode.MockProtectionStop]: 800,
  [ProtectionReasonCode.InvalidProtectionState]: 700,
  [ProtectionReasonCode.InterpretationNeedsClarification]: 600,
  [ProtectionReasonCode.UnknownUsageArea]: 500,
  [ProtectionReasonCode.EmptyUserMessage]: 400,
  [ProtectionReasonCode.RequestScopeUnclear]: 300,
  [ProtectionReasonCode.ProtectionEvaluatorUnavailable]: 200,
  [ProtectionReasonCode.ProtectionEvaluatorInvalidResponse]: 100,
  [ProtectionReasonCode.ProtectionPassed]: 0,
};

/** Selects policy outcome by explicit decision and same-level reason precedence. */
export function aggregateProtectionResults(
  results: readonly ProtectionResult[],
): ProtectionResult {
  if (results.length === 0) {
    throw new Error('Protection aggregation requires at least one result.');
  }

  return results.reduce((selected, candidate) => {
    const decisionDifference =
      DECISION_PRECEDENCE[candidate.decision] -
      DECISION_PRECEDENCE[selected.decision];

    if (decisionDifference !== 0) {
      return decisionDifference > 0 ? candidate : selected;
    }

    const reasonDifference =
      REASON_PRECEDENCE[candidate.reasonCode] -
      REASON_PRECEDENCE[selected.reasonCode];

    if (reasonDifference !== 0) {
      return reasonDifference > 0 ? candidate : selected;
    }

    return candidate.reasonCode.localeCompare(selected.reasonCode) < 0
      ? candidate
      : selected;
  });
}

@Injectable()
export class ProtectionService {
  constructor(
    private readonly deterministicChecks: DeterministicProtectionChecks,
  ) {}

  evaluate(context: ProtectionContext): Promise<ProtectionEvaluation> {
    const deterministicResults = this.deterministicChecks.evaluate(context);
    const deterministicResult =
      aggregateProtectionResults(deterministicResults);

    if (deterministicResult.decision !== 'continue') {
      return Promise.resolve({
        result: deterministicResult,
        deterministicResult,
        deterministicResults,
      });
    }

    const semanticEvidenceResult: ProtectionResult = context
      .protectionSemanticEvidence.requestScopeUnclear
      ? {
          decision: 'clarify',
          reasonCode: ProtectionReasonCode.RequestScopeUnclear,
          reason: 'A material request-scope distinction remains unclear.',
        }
      : {
          decision: 'continue',
          reasonCode: ProtectionReasonCode.ProtectionPassed,
          reason: 'Protection checks passed.',
        };
    return Promise.resolve({
      result: aggregateProtectionResults([
        ...deterministicResults,
        semanticEvidenceResult,
      ]),
      deterministicResult,
      deterministicResults,
      semanticEvidenceResult,
    });
  }
}
