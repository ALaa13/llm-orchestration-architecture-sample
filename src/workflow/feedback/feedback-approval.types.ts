import type { RuleCandidate } from './feedback.types';
import type { FeedbackApprovalIntent } from '../interpretation/interpretation.types';

/** A reply is meaningful only while resolving an existing pending candidate. */
export type FeedbackApprovalDecision = Exclude<FeedbackApprovalIntent, 'none'>;

export type FeedbackApprovalResolution =
  | {
      outcome: 'committed' | 'already_committed' | 'apply_current' | 'rejected';
      candidate: RuleCandidate;
    }
  | {
      outcome: 'ambiguous';
    }
  | {
      outcome: 'unclear';
    }
  | {
      outcome: 'conflict';
      relationship: 'similar' | 'contradiction';
      candidate: RuleCandidate;
      relatedRules: RuleCandidate[];
    }
  | {
      outcome: 'conflict_uncertain';
      candidate: RuleCandidate;
    }
  | {
      outcome: 'existing_kept';
      candidate: RuleCandidate;
    }
  | {
      outcome: 'replaced';
      candidate: RuleCandidate;
      supersededRules: RuleCandidate[];
    };
