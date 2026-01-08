/**
 * Logger Utility
 *
 * Provides structured JSON logging for the Twenty CRM Worker.
 * Supports different log levels and contextual data.
 *
 * Uses `import { env } from 'cloudflare:workers'` for global access to LOG_LEVEL.
 *
 * @module logger
 */

import { env } from 'cloudflare:workers';

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Base log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  service?: string;
}

/**
 * Logger instance
 */
export class Logger {
  private readonly minLevel: number;
  private readonly service: string;

  constructor(config: LoggerConfig = { level: 'info' }) {
    this.minLevel = LOG_LEVEL_VALUES[config.level];
    this.service = config.service || 'twenty-worker';
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= this.minLevel;
  }

  /**
   * Format and output a log entry
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        service: this.service,
        ...context,
      },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Output as JSON for structured logging
    console.log(JSON.stringify(entry));
  }

  /**
   * Debug level log
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * Info level log
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * Warning level log
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * Error level log
   */
  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): void {
    const err = error instanceof Error ? error : undefined;

    this.log('error', message, context, err);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      level: Object.entries(LOG_LEVEL_VALUES).find(
        ([_, v]) => v === this.minLevel,
      )?.[0] as LogLevel,
      service: this.service,
    });

    // Wrap the log method to include parent context
    const parentLog = childLogger['log'].bind(childLogger);

    childLogger['log'] = (
      level: LogLevel,
      message: string,
      childContext?: Record<string, unknown>,
      error?: Error,
    ) => {
      parentLog(level, message, { ...context, ...childContext }, error);
    };

    return childLogger;
  }
}

/**
 * Default logger instance
 * Uses LOG_LEVEL from environment via cloudflare:workers global import
 */
export const logger = new Logger({
  level: (env.LOG_LEVEL || 'info') as LogLevel,
  service: 'twenty-worker',
});

/**
 * Create a logger for a specific module
 * Uses LOG_LEVEL from environment via cloudflare:workers global import
 */
export const createLogger = (module: string): Logger => {
  const level = (env.LOG_LEVEL || 'info') as LogLevel;

  return new Logger({ level, service: `twenty-worker:${module}` });
};

/**
 * Create a logger from environment configuration
 * @deprecated Use `createLogger(module)` instead - it automatically reads LOG_LEVEL from global env
 */
export const createLoggerFromEnv = (envParam: {
  LOG_LEVEL?: string;
}): Logger => {
  const level = (envParam.LOG_LEVEL || 'info') as LogLevel;

  return new Logger({ level, service: 'twenty-worker' });
};
