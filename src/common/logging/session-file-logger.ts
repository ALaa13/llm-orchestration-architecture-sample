import {
  ConsoleLogger,
  type LogLevel,
  type LoggerService,
} from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Keeps the familiar Nest console output and mirrors every enabled log entry
 * to a plain-text file for local test-session review.
 */
export class SessionFileLogger implements LoggerService {
  private readonly consoleLogger: ConsoleLogger;
  private readonly filePath: string;
  private enabledLevels: Set<LogLevel>;
  private fileUnavailable = false;

  constructor(filePath: string, logLevels: LogLevel[]) {
    this.filePath = resolve(process.cwd(), filePath);
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.consoleLogger = new ConsoleLogger({ logLevels });
    this.enabledLevels = new Set(logLevels);
  }

  /** Writes a normal Nest log entry to the console and session file. */
  log(message: unknown, context?: string): void {
    this.consoleLogger.log(message, context);
    this.persist('log', message, context);
  }

  /** Writes an error entry and preserves a safe stack when Nest provides one. */
  error(message: unknown, stack?: string, context?: string): void {
    this.consoleLogger.error(message, stack, context);
    this.persist('error', message, context, stack);
  }

  /** Writes a warning entry to both configured outputs. */
  warn(message: unknown, context?: string): void {
    this.consoleLogger.warn(message, context);
    this.persist('warn', message, context);
  }

  /** Writes a debug entry when debug logging is enabled. */
  debug(message: unknown, context?: string): void {
    this.consoleLogger.debug(message, context);
    this.persist('debug', message, context);
  }

  /** Writes a verbose entry when verbose logging is enabled. */
  verbose(message: unknown, context?: string): void {
    this.consoleLogger.verbose(message, context);
    this.persist('verbose', message, context);
  }

  /** Writes a fatal entry to both configured outputs. */
  fatal(message: unknown, context?: string): void {
    this.consoleLogger.fatal(message, context);
    this.persist('fatal', message, context);
  }

  /** Keeps file filtering aligned with Nest's active log levels. */
  setLogLevels(levels: LogLevel[]): void {
    this.consoleLogger.setLogLevels(levels);
    this.enabledLevels = new Set(levels);
  }

  private persist(
    level: LogLevel,
    message: unknown,
    context: string | undefined,
    stack?: string,
  ): void {
    if (!this.enabledLevels.has(level) || this.fileUnavailable) return;
    const timestamp = new Date().toISOString();
    const rendered = this.render(message);
    const contextText = context === undefined ? '' : ` [${context}]`;
    const stackText = stack === undefined ? '' : `\n${stack}`;
    try {
      appendFileSync(
        this.filePath,
        `${timestamp} ${level.toUpperCase()}${contextText} ${rendered}${stackText}\n`,
        'utf8',
      );
    } catch {
      // Keep request handling and console logs available. Disable the optional
      // file mirror until restart rather than retrying a broken disk per entry.
      this.fileUnavailable = true;
      this.consoleLogger.warn(
        'Session file logging is unavailable; console logging continues. Restart after restoring file access.',
      );
    }
  }

  private render(message: unknown): string {
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(message);
    } catch {
      return '[unserializable log message]';
    }
  }
}
