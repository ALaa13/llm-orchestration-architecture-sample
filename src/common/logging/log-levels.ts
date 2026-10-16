import type { LogLevel } from '@nestjs/common';

export const APPLICATION_LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const satisfies readonly LogLevel[];

export type ApplicationLogLevel = (typeof APPLICATION_LOG_LEVELS)[number];

export function enabledLogLevels(minimum: ApplicationLogLevel): LogLevel[] {
  const minimumIndex = APPLICATION_LOG_LEVELS.indexOf(minimum);
  return APPLICATION_LOG_LEVELS.slice(minimumIndex);
}
