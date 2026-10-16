import { Injectable } from '@nestjs/common';
import {
  ProtectionReasonCode,
  type ProtectionContext,
  type ProtectionResult,
} from './protection.types';

@Injectable()
export class DeterministicProtectionChecks {
  evaluate(context: ProtectionContext): ProtectionResult[] {
    const results: ProtectionResult[] = [];

    if (context.interpretation.needsClarification) {
      results.push({
        decision: 'clarify',
        reasonCode: ProtectionReasonCode.InterpretationNeedsClarification,
        reason: 'The interpreted request needs clarification.',
      });
    }

    if (context.interpretation.usageArea === 'unknown') {
      results.push({
        decision: 'clarify',
        reasonCode: ProtectionReasonCode.UnknownUsageArea,
        reason: 'The request usage area is unknown.',
      });
    }

    if (context.latestUserMessage.trim().length === 0) {
      results.push({
        decision: 'clarify',
        reasonCode: ProtectionReasonCode.EmptyUserMessage,
        reason: 'The latest user message is empty.',
      });
    }

    if (results.length === 0) {
      results.push({
        decision: 'continue',
        reasonCode: ProtectionReasonCode.ProtectionPassed,
        reason: 'Deterministic protection checks passed.',
      });
    }

    return results;
  }
}
