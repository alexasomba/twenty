/**
 * Twenty CRM API - Cloudflare Worker Entry Point
 *
 * This is the main entry point for the Twenty CRM API running on Cloudflare Workers.
 * It handles all incoming HTTP requests and routes them through the Hono router.
 *
 * @module worker
 */

import { createLogger } from 'src/core/logger';
import { router } from 'src/router';
// Env type is globally available from worker-configuration.d.ts

// Logger uses cloudflare:workers global import for LOG_LEVEL
const logger = createLogger('worker');

/**
 * Cloudflare Worker fetch handler
 *
 * Entry point for all HTTP requests to the Twenty CRM API.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const honoExecutionContext: {
      waitUntil(promise: Promise<unknown>): void;
      passThroughOnException(): void;
      props: Record<string, unknown>;
    } = {
      ...ctx,
      props: {},
    };

    return router.fetch(request, env, honoExecutionContext);
  },

  /**
   * Scheduled event handler for cron triggers
   */
  async scheduled(
    event: ScheduledEvent,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    logger.info('Scheduled event triggered', {
      scheduledTime: event.scheduledTime,
      cron: event.cron,
    });

    // Handle different cron triggers based on cron expression
    switch (event.cron) {
      case '*/5 * * * *':
        // Email sync polling (every 5 minutes)
        logger.info('Running email sync polling');
        // TODO: Implement email sync polling
        break;
      case '0 * * * *':
        // Hourly maintenance tasks
        logger.info('Running hourly maintenance');
        // TODO: Implement hourly maintenance
        break;
      case '0 0 * * *':
        // Daily cleanup tasks
        logger.info('Running daily cleanup');
        // TODO: Implement daily cleanup
        break;
      default:
        logger.warn('Unknown cron trigger', { cron: event.cron });
    }
  },

  /**
   * Queue message handler (consumer)
   */
  async queue(
    batch: MessageBatch,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    logger.info('Processing queue batch', {
      messageCount: batch.messages.length,
      queue: batch.queue,
    });

    for (const message of batch.messages) {
      try {
        // TODO: Route messages to appropriate handlers based on queue/type
        const body = message.body as Record<string, unknown>;

        logger.debug('Processing message', {
          id: message.id,
          type: body.type,
        });

        // Acknowledge successful processing
        message.ack();
      } catch (error) {
        logger.error('Failed to process message', error, {
          messageId: message.id,
        });
        // Retry the message
        message.retry();
      }
    }
  },
};

/**
 * Durable Object export for real-time WebSocket handling
 * Will be implemented in Phase 9
 */
export { WorkspaceRealtimeHub } from 'src/durable-objects/workspace-realtime';
