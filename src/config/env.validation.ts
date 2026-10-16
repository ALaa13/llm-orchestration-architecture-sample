import { z } from 'zod';
import { APPLICATION_LOG_LEVELS } from '../common/logging/log-levels';
import { NODE_ENVIRONMENTS } from '../common/types';

export const environmentDefaults = {
  nodeEnv: 'development',
  apiPrefix: 'api',
  port: 4000,
  corsOrigin: 'https://example.invalid',
  logLevel: 'log',
  logFilePath: 'logs/architecture-sample.log',
  attributionDebug: false,
  interpretationProvider: 'mock',
  interpretationModel: 'sample-model',
  interpretationTimeoutMs: 30000,
  generationProvider: 'mock',
  generationTimeoutMs: 120000,
  generationMaxOutputTokens: 1600,
  verificationProvider: 'mock',
  verificationTimeoutMs: 30000,
  verificationMaxOutputTokens: 1024,
  postgresEnabled: false,
  postgresHost: 'example.invalid',
  postgresPort: 5432,
  postgresDatabase: 'architecture-sample',
  postgresUser: 'architecture-sample',
  knowledgeRetrievalProvider: 'mock',
  knowledgeRetrievalTimeoutMs: 5000,
  knowledgeRetrievalLimit: 10,
} as const;

const optionalOpenAiApiKeySchema = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const optionalAnthropicApiKeySchema = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const optionalModelSchema = z
  .union([z.literal(''), z.string().trim().min(1).max(200)])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const optionalKnowledgeCenterUrlSchema = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .url({ protocol: /^https?$/ }),
  ])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const optionalKnowledgeCenterSharedKeySchema = z
  .union([z.literal(''), z.string().trim().min(1)])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/**
 * Single source of truth for every environment variable this service reads.
 *
 * Process environment values are always strings, so numeric variables are
 * coerced here rather than at the point of use.
 */
export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default(environmentDefaults.nodeEnv),
    API_PREFIX: z
      .string()
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/,
        'must start with a letter or digit and contain only letters, digits, "/", "_", or "-"',
      )
      .default(environmentDefaults.apiPrefix),
    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(environmentDefaults.port),
    CORS_ORIGIN: z
      .url({ protocol: /^https?$/ })
      .default(environmentDefaults.corsOrigin),
    LOG_LEVEL: z
      .enum(APPLICATION_LOG_LEVELS)
      .default(environmentDefaults.logLevel),
    LOG_FILE_PATH: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .default(environmentDefaults.logFilePath),
    ATTRIBUTION_DEBUG: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(environmentDefaults.attributionDebug),
    LIBRECHAT_API_KEY: z.string().trim().min(1),
    FEEDBACK_OWNER_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(200).optional(),
    ),
    INTERPRETATION_PROVIDER: z
      .enum(['mock', 'openai'])
      .default(environmentDefaults.interpretationProvider),
    INTERPRETATION_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .default(environmentDefaults.interpretationModel),
    OPENAI_API_KEY: optionalOpenAiApiKeySchema,
    INTERPRETATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120000)
      .default(environmentDefaults.interpretationTimeoutMs),
    GENERATION_PROVIDER: z
      .enum(['mock', 'anthropic'])
      .default(environmentDefaults.generationProvider),
    GENERATION_MODEL: optionalModelSchema,
    /** Benchmark-only judge pin; it does not affect production generation. */
    GENERATION_JUDGE_MODEL: optionalModelSchema,
    ANTHROPIC_API_KEY: optionalAnthropicApiKeySchema,
    GENERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120000)
      .default(environmentDefaults.generationTimeoutMs),
    GENERATION_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(1)
      .max(8192)
      .default(environmentDefaults.generationMaxOutputTokens),
    VERIFICATION_PROVIDER: z
      .enum(['mock', 'openai'])
      .default(environmentDefaults.verificationProvider),
    VERIFICATION_MODEL: optionalModelSchema,
    VERIFICATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120000)
      .default(environmentDefaults.verificationTimeoutMs),
    VERIFICATION_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(1)
      .max(8192)
      .default(environmentDefaults.verificationMaxOutputTokens),
    POSTGRES_ENABLED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(environmentDefaults.postgresEnabled),
    POSTGRES_HOST: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .default(environmentDefaults.postgresHost),
    POSTGRES_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(environmentDefaults.postgresPort),
    POSTGRES_DB: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .default(environmentDefaults.postgresDatabase),
    POSTGRES_USER: z
      .string()
      .trim()
      .min(1)
      .max(63)
      .default(environmentDefaults.postgresUser),
    POSTGRES_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).max(500).optional(),
    ),
    KNOWLEDGE_RETRIEVAL_PROVIDER: z
      .enum(['mock', 'knowledge_center'])
      .default(environmentDefaults.knowledgeRetrievalProvider),
    KNOWLEDGE_CENTER_URL: optionalKnowledgeCenterUrlSchema,
    KNOWLEDGE_CENTER_SHARED_KEY: optionalKnowledgeCenterSharedKeySchema,
    KNOWLEDGE_RETRIEVAL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120000)
      .default(environmentDefaults.knowledgeRetrievalTimeoutMs),
    KNOWLEDGE_RETRIEVAL_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(environmentDefaults.knowledgeRetrievalLimit),
  })
  .superRefine((environment, context) => {
    if (
      environment.INTERPRETATION_PROVIDER === 'openai' &&
      environment.OPENAI_API_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'is required when INTERPRETATION_PROVIDER is openai',
      });
    }
    if (
      environment.GENERATION_PROVIDER === 'anthropic' &&
      environment.ANTHROPIC_API_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'is required when GENERATION_PROVIDER is anthropic',
      });
    }
    if (
      environment.GENERATION_PROVIDER === 'anthropic' &&
      environment.GENERATION_MODEL === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['GENERATION_MODEL'],
        message: 'is required when GENERATION_PROVIDER is anthropic',
      });
    }
    if (
      environment.VERIFICATION_PROVIDER === 'openai' &&
      environment.OPENAI_API_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'is required when VERIFICATION_PROVIDER is openai',
      });
    }
    if (
      environment.VERIFICATION_PROVIDER === 'openai' &&
      environment.VERIFICATION_MODEL === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['VERIFICATION_MODEL'],
        message: 'is required when VERIFICATION_PROVIDER is openai',
      });
    }
    if (
      environment.POSTGRES_ENABLED &&
      environment.POSTGRES_PASSWORD === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['POSTGRES_PASSWORD'],
        message: 'is required when POSTGRES_ENABLED is true',
      });
    }
    if (
      environment.KNOWLEDGE_RETRIEVAL_PROVIDER === 'knowledge_center' &&
      environment.KNOWLEDGE_CENTER_URL === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['KNOWLEDGE_CENTER_URL'],
        message:
          'is required when KNOWLEDGE_RETRIEVAL_PROVIDER is knowledge_center',
      });
    }
    if (
      environment.KNOWLEDGE_RETRIEVAL_PROVIDER === 'knowledge_center' &&
      environment.KNOWLEDGE_CENTER_SHARED_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['KNOWLEDGE_CENTER_SHARED_KEY'],
        message:
          'is required when KNOWLEDGE_RETRIEVAL_PROVIDER is knowledge_center',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Validates the process environment and applies defaults.
 *
 * Only variable names and schema messages appear in the thrown error; values
 * are never echoed, because the environment can hold credentials.
 */
export function validateEnvironment(
  source: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration — ${details}`);
  }

  return result.data;
}
