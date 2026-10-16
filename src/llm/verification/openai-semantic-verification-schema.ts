import { type core, z } from 'zod';
import type { TaskType } from '../../workflow/interpretation/interpretation.types';
import {
  type SemanticVerificationReasonCode,
  VerificationReasonCode,
} from '../../workflow/verification/verification.types';
import {
  semanticVerificationReasonCodes,
  semanticVerificationResultSchema,
} from './semantic-verification-schema';

type JsonSchemaObject = core.JSONSchema.BaseSchema;

const nonRevisionSemanticVerificationReasonCodes = [
  VerificationReasonCode.Passed,
  VerificationReasonCode.TaskNotFulfilled,
  VerificationReasonCode.WrongUsageArea,
  VerificationReasonCode.PolicyRuleViolation,
  VerificationReasonCode.ControlledKnowledgeContradiction,
  VerificationReasonCode.UnsupportedSourceClaim,
  VerificationReasonCode.OutputUnsafeToRelease,
] as const;

type ProviderReasonCodes =
  | typeof semanticVerificationReasonCodes
  | typeof nonRevisionSemanticVerificationReasonCodes;

interface ProviderVerificationOutput {
  decision: 'pass' | 'refine' | 'reject';
  reasonCodes: SemanticVerificationReasonCode[];
  feedback: {
    issues: Array<{
      code: SemanticVerificationReasonCode;
      message: string;
    }>;
    revisionInstructions: string[];
  } | null;
  materiallyUsedRequiredSourceIds: string[];
}

function reasonCodesForTask(taskType: TaskType): ProviderReasonCodes {
  return taskType === 'revision'
    ? semanticVerificationReasonCodes
    : nonRevisionSemanticVerificationReasonCodes;
}

function providerResultSchema(
  requiredSourceIds: readonly string[],
  taskType: TaskType,
): z.ZodType<ProviderVerificationOutput> {
  const reasonCodeSchema = z.enum(
    reasonCodesForTask(taskType).filter(
      (code) => code !== VerificationReasonCode.Passed,
    ),
  );
  const providerFeedbackSchema = z.object({
    issues: z
      .array(
        z.object({
          code: reasonCodeSchema,
          message: z.string().min(1).max(400),
        }),
      )
      .min(1)
      .max(5),
    revisionInstructions: z.array(z.string().min(1).max(400)).min(1).max(5),
  });
  const sourceIdSchema: z.ZodType<string> =
    requiredSourceIds.length === 0
      ? z.string().max(0)
      : z.enum(requiredSourceIds as readonly [string, ...string[]]);
  const sources = z
    .array(sourceIdSchema)
    .max(requiredSourceIds.length === 0 ? 0 : 50);
  // Encode cross-field invariants in the wire schema, not just post-parse
  // refinements. Never repair an inconsistent decision into a release approval.
  return z.union([
    z
      .object({
        decision: z.literal('pass'),
        reasonCodes: z
          .array(z.literal(VerificationReasonCode.Passed))
          .length(1),
        feedback: z.null(),
        materiallyUsedRequiredSourceIds: sources,
      })
      .strict(),
    z
      .object({
        decision: z.literal('refine'),
        reasonCodes: z.array(reasonCodeSchema).min(1).max(3),
        feedback: providerFeedbackSchema,
        materiallyUsedRequiredSourceIds: sources,
      })
      .strict(),
    z
      .object({
        decision: z.literal('reject'),
        reasonCodes: z.array(reasonCodeSchema).min(1).max(3),
        feedback: providerFeedbackSchema.nullable(),
        materiallyUsedRequiredSourceIds: sources,
      })
      .strict(),
  ]);
}

export function buildStrictSemanticVerificationJsonSchema(
  requiredSourceIds: readonly string[] = [],
  taskType: TaskType,
): JsonSchemaObject {
  const schema = z.toJSONSchema(
    // Structured Outputs permits nested anyOf, but not a union at the root.
    z
      .object({ result: providerResultSchema(requiredSourceIds, taskType) })
      .strict(),
  );
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error('Semantic verification schema must be a JSON object.');
  }
  const schemaWithoutDialect = { ...schema };
  delete schemaWithoutDialect.$schema;
  return schemaWithoutDialect;
}

/** Validates OpenAI's required-nullable wire shape against the domain contract. */
export function parseOpenAISemanticVerificationProviderOutput(
  output: unknown,
  requiredSourceIds: readonly string[],
  taskType: TaskType,
): z.infer<typeof semanticVerificationResultSchema> {
  const { result: providerOutput } = z
    .object({
      result: providerResultSchema(requiredSourceIds, taskType),
    })
    .strict()
    .parse(output);
  const allowedIds = new Set(requiredSourceIds);
  const materiallyUsedRequiredSourceIds = [
    ...new Set(providerOutput.materiallyUsedRequiredSourceIds),
  ];
  if (
    materiallyUsedRequiredSourceIds.some(
      (sourceId) => !allowedIds.has(sourceId),
    )
  ) {
    throw new Error(
      'Semantic verification returned an unknown or optional source ID.',
    );
  }

  return semanticVerificationResultSchema.parse({
    ...providerOutput,
    feedback: providerOutput.feedback ?? undefined,
    materiallyUsedRequiredSourceIds,
  });
}
