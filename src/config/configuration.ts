import type { NodeEnvironment } from '../common/types';
import type { ApplicationLogLevel } from '../common/logging/log-levels';
import { validateEnvironment } from './env.validation';

export interface ApplicationConfig {
  app: {
    nodeEnv: NodeEnvironment;
    apiPrefix: string;
    port: number;
    corsOrigin: string;
  };
  logging: {
    level: ApplicationLogLevel;
    filePath: string;
    attributionDebug: boolean;
  };
  security: {
    libreChatApiKey: string;
  };
  feedback: {
    ownerId: string | undefined;
  };
  postgres: {
    enabled: boolean;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string | undefined;
  };
  llm: {
    interpretationProvider: 'mock' | 'openai';
    interpretationModel: string;
    openAiApiKey: string | undefined;
    interpretationTimeoutMs: number;
    generation: {
      provider: 'mock' | 'anthropic';
      model: string | undefined;
      anthropicApiKey: string | undefined;
      timeoutMs: number;
      maxOutputTokens: number;
    };
    verification: {
      provider: 'mock' | 'openai';
      model: string | undefined;
      openAiApiKey: string | undefined;
      timeoutMs: number;
      maxOutputTokens: number;
    };
  };
  knowledgeRetrieval: {
    provider: 'mock' | 'knowledge_center';
    knowledgeCenterUrl: string | undefined;
    sharedKey: string | undefined;
    timeoutMs: number;
    limit: number;
  };
}

/**
 * Maps startup-validated environment values to the application's typed config.
 *
 * This function performs no secret or provider validation itself; that remains
 * centralized in environmentSchema.
 */
export default (): ApplicationConfig => {
  const environment = validateEnvironment(process.env);

  return {
    app: {
      nodeEnv: environment.NODE_ENV,
      apiPrefix: environment.API_PREFIX,
      port: environment.PORT,
      corsOrigin: environment.CORS_ORIGIN,
    },
    logging: {
      level: environment.LOG_LEVEL,
      filePath: environment.LOG_FILE_PATH,
      attributionDebug: environment.ATTRIBUTION_DEBUG,
    },
    security: {
      libreChatApiKey: environment.LIBRECHAT_API_KEY,
    },
    feedback: {
      ownerId: environment.FEEDBACK_OWNER_ID,
    },
    postgres: {
      enabled: environment.POSTGRES_ENABLED,
      host: environment.POSTGRES_HOST,
      port: environment.POSTGRES_PORT,
      database: environment.POSTGRES_DB,
      user: environment.POSTGRES_USER,
      password: environment.POSTGRES_PASSWORD,
    },
    llm: {
      interpretationProvider: environment.INTERPRETATION_PROVIDER,
      interpretationModel: environment.INTERPRETATION_MODEL,
      openAiApiKey: environment.OPENAI_API_KEY,
      interpretationTimeoutMs: environment.INTERPRETATION_TIMEOUT_MS,
      generation: {
        provider: environment.GENERATION_PROVIDER,
        model: environment.GENERATION_MODEL,
        anthropicApiKey: environment.ANTHROPIC_API_KEY,
        timeoutMs: environment.GENERATION_TIMEOUT_MS,
        maxOutputTokens: environment.GENERATION_MAX_OUTPUT_TOKENS,
      },
      verification: {
        provider: environment.VERIFICATION_PROVIDER,
        model: environment.VERIFICATION_MODEL,
        openAiApiKey: environment.OPENAI_API_KEY,
        timeoutMs: environment.VERIFICATION_TIMEOUT_MS,
        maxOutputTokens: environment.VERIFICATION_MAX_OUTPUT_TOKENS,
      },
    },
    knowledgeRetrieval: {
      provider: environment.KNOWLEDGE_RETRIEVAL_PROVIDER,
      knowledgeCenterUrl: environment.KNOWLEDGE_CENTER_URL,
      sharedKey: environment.KNOWLEDGE_CENTER_SHARED_KEY,
      timeoutMs: environment.KNOWLEDGE_RETRIEVAL_TIMEOUT_MS,
      limit: environment.KNOWLEDGE_RETRIEVAL_LIMIT,
    },
  };
};
