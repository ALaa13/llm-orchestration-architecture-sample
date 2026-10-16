import type { RuleCandidate } from './feedback.types';
import type { UsageArea } from '../interpretation/interpretation.types';
import type { ChatMessage } from '../conversation-context/conversation-context.types';

export interface FeedbackAnalysisInput {
  originalFeedback: string;
  usageArea: UsageArea;
  recentMessages: readonly ChatMessage[];
  refersToPreviousContext: boolean;
}

/** Provider-neutral boundary for turning reusable intent into a preliminary candidate. */
export abstract class FeedbackAnalyzer {
  abstract analyze(input: FeedbackAnalysisInput): RuleCandidate;
}

