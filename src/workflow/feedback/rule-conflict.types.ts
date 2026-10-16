import { z } from 'zod';
import type { RuleCandidate } from './feedback.types';

export const ruleConflictRelationshipSchema = z.enum([
  'compatible',
  'duplicate',
  'similar',
  'contradiction',
  'uncertain',
]);
export type RuleConflictRelationship = z.infer<
  typeof ruleConflictRelationshipSchema
>;

export const ruleConflictAnalysisSchema = z.strictObject({
  relationship: ruleConflictRelationshipSchema,
  relatedRuleIds: z.array(z.string().trim().min(1)).max(100),
  reason: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
});
export type RuleConflictAnalysis = z.infer<typeof ruleConflictAnalysisSchema>;

export interface RuleConflictAnalysisInput {
  candidate: Pick<RuleCandidate, 'id' | 'derivedRule' | 'scope'> & {
    derivedRule: string;
  };
  existingRules: Array<
    Pick<RuleCandidate, 'id' | 'derivedRule' | 'scope'> & {
      derivedRule: string;
    }
  >;
}
