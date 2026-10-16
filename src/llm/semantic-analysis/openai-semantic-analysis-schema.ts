import { type core, z } from 'zod';
import {
  clarificationSchema,
  feedbackExecutionModeSchema,
  feedbackApprovalIntentSchema,
  interpretationResultCoreSchema,
  responseLanguageSchema,
} from '../../workflow/interpretation/interpretation.types';
import {
  combinedSemanticAnalysisResultSchema,
  type CombinedSemanticAnalysisResult,
} from '../../workflow/semantic-analysis/semantic-analysis.types';

type JsonSchemaObject = core.JSONSchema.BaseSchema;

const providerClarificationSchema = z.object({
  ...clarificationSchema.shape,
  options: clarificationSchema.shape.options.unwrap().nullable(),
});
const providerInterpretationResultSchema = z.object({
  ...interpretationResultCoreSchema.shape,
  feedbackExecutionMode: feedbackExecutionModeSchema,
  feedbackApprovalIntent: feedbackApprovalIntentSchema.default('none'),
  responseLanguage: responseLanguageSchema.default('en'),
  workingArtifactMessageIndex: z.number().int().min(0).nullable().default(null),
  clarification: providerClarificationSchema.nullable(),
});
const providerCombinedSemanticAnalysisResultSchema = z.object({
  interpretation: providerInterpretationResultSchema,
  protectionEvidence: z.object({ requestScopeUnclear: z.boolean() }),
});
type ProviderCombinedSemanticAnalysisResult = z.infer<
  typeof providerCombinedSemanticAnalysisResultSchema
>;

/** Derives the OpenAI strict wire schema from provider-local schema adaptations. */
export function buildStrictSemanticAnalysisJsonSchema(): JsonSchemaObject {
  const schema = z.toJSONSchema(providerCombinedSemanticAnalysisResultSchema);
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error('Semantic analysis schema must be a JSON object.');
  }
  const schemaWithoutDialect = rewriteOneOfAsAnyOf(schema);
  delete schemaWithoutDialect.$schema;
  return schemaWithoutDialect;
}

/** OpenAI strict schemas accept anyOf, but reject Zod's discriminated-union oneOf. */
function rewriteOneOfAsAnyOf(schema: JsonSchemaObject): JsonSchemaObject {
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key === 'oneOf' ? 'anyOf' : key,
      rewriteOneOfAsAnyOfValue(value),
    ]),
  );
}

function rewriteOneOfAsAnyOfValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteOneOfAsAnyOfValue);
  }
  if (typeof value === 'object' && value !== null) {
    return rewriteOneOfAsAnyOf(value as JsonSchemaObject);
  }
  return value;
}

/** Validates provider JSON, normalizes nullable wire fields, then validates policyly. */
export function parseSemanticAnalysisProviderOutput(
  output: unknown,
): CombinedSemanticAnalysisResult {
  const providerOutput =
    providerCombinedSemanticAnalysisResultSchema.parse(output);
  const normalized = normalizeSemanticAnalysisProviderOutput(providerOutput);
  return combinedSemanticAnalysisResultSchema.parse(normalized);
}

function normalizeSemanticAnalysisProviderOutput(
  providerOutput: ProviderCombinedSemanticAnalysisResult,
): unknown {
  const {
    clarification,
    workingArtifactMessageIndex,
    ...interpretationWithoutClarification
  } = providerOutput.interpretation;
  return {
    interpretation: {
      ...interpretationWithoutClarification,
      ...(workingArtifactMessageIndex === null ||
      interpretationWithoutClarification.taskType !== 'revision'
        ? {}
        : { workingArtifactMessageIndex }),
      ...(clarification === null
        ? {}
        : { clarification: normalizeClarification(clarification) }),
    },
    protectionEvidence: providerOutput.protectionEvidence,
  };
}

function normalizeClarification(
  clarification: NonNullable<
    ProviderCombinedSemanticAnalysisResult['interpretation']['clarification']
  >,
): object {
  const { options, ...clarificationWithoutOptions } = clarification;
  return {
    ...clarificationWithoutOptions,
    ...(options === null ? {} : { options }),
  };
}
