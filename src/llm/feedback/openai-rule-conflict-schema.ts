import { type core, z } from 'zod';
import {
  ruleConflictAnalysisSchema,
  type RuleConflictAnalysis,
} from '../../workflow/feedback/rule-conflict.types';

type JsonSchemaObject = core.JSONSchema.BaseSchema;

const providerRuleConflictAnalysisSchema = z.strictObject({
  relationship: ruleConflictAnalysisSchema.shape.relationship,
  relatedRuleIds: ruleConflictAnalysisSchema.shape.relatedRuleIds,
  reason: ruleConflictAnalysisSchema.shape.reason,
  confidence: ruleConflictAnalysisSchema.shape.confidence,
});

export function buildStrictRuleConflictJsonSchema(): JsonSchemaObject {
  const schema = z.toJSONSchema(providerRuleConflictAnalysisSchema);
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error('Rule conflict schema must be a JSON object.');
  }
  const result = { ...schema };
  delete result.$schema;
  return result;
}

export function parseRuleConflictProviderOutput(
  output: unknown,
): RuleConflictAnalysis {
  return ruleConflictAnalysisSchema.parse(
    providerRuleConflictAnalysisSchema.parse(output),
  );
}
