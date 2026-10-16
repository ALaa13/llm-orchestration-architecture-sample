import type {
  RuleConflictAnalysis,
  RuleConflictAnalysisInput,
} from './rule-conflict.types';

/** Semantic-only boundary. It analyzes meaning but has no write authority. */
export abstract class RuleConflictAnalyzer {
  abstract analyze(
    input: RuleConflictAnalysisInput,
  ): Promise<RuleConflictAnalysis>;
}
