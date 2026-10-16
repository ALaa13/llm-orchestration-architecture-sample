import type { RuleCandidate } from './feedback.types';
import type { RuleConflictRelationship } from './rule-conflict.types';

export type ControlledCommitResult =
  | { outcome: 'committed'; candidate: RuleCandidate }
  | { outcome: 'already_committed'; candidate: RuleCandidate }
  | {
      outcome: 'conflict';
      relationship: Extract<
        RuleConflictRelationship,
        'similar' | 'contradiction'
      >;
      candidate: RuleCandidate;
      relatedRules: RuleCandidate[];
    }
  | { outcome: 'uncertain'; candidate: RuleCandidate }
  | {
      outcome: 'replaced';
      candidate: RuleCandidate;
      supersededRules: RuleCandidate[];
    };
