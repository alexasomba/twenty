/**
 * Workspace Realtime Hub - Durable Object
 *
 * Manages WebSocket connections for real-time GraphQL subscriptions within a workspace.
 * Each workspace has its own Durable Object instance for isolation.
 *
 * @see https://developers.cloudflare.com/durable-objects/
 */

// Env type is globally available from worker-configuration.d.ts

/**
 * WebSocket message types for subscription protocol
 */
export type WebSocketMessage = {
  type:
    | 'subscribe'
    | 'unsubscribe'
    | 'ping'
    | 'pong'
    | 'subscription'
    | 'error';
  topic?: string;
  data?: unknown;
  error?: string;
};

/**
 * WorkspaceRealtimeHub Durable Object
 *
 * Handles WebSocket connections and broadcasts for a single workspace.
 * Extends CloudflareWorkersModule.DurableObject base class for proper hibernation support.
 */
export class WorkspaceRealtimeHub extends CloudflareWorkersModule.DurableObject<Env> {
  private sessions: Map<WebSocket, Set<string>> = new Map();

  /**
   * Handle incoming HTTP requests to this Durable Object.
   * Primarily used for WebSocket upgrades.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Broadcast endpoint (internal)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade request
   */
  private async handleWebSocketUpgrade(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection using Hibernation API
    this.ctx.acceptWebSocket(server);

    // Initialize session tracking
    this.sessions.set(server, new Set());

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle WebSocket messages
   */
  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    try {
      const data = JSON.parse(message as string) as WebSocketMessage;

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(ws, data.topic);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, data.topic);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          ws.send(
            JSON.stringify({
              type: 'error',
              error: `Unknown message type: ${data.type}`,
            }),
          );
      }
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
        }),
      );
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
  ): Promise<void> {
    this.sessions.delete(ws);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    // Error already logged by the runtime
    this.sessions.delete(ws);
  }

  /**
   * Subscribe a WebSocket to a topic
   */
  private handleSubscribe(ws: WebSocket, topic?: string): void {
    if (!topic) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Topic required for subscribe',
        }),
      );

      return;
    }

    const subscriptions = this.sessions.get(ws);

    if (subscriptions) {
      subscriptions.add(topic);
      ws.send(
        JSON.stringify({
          type: 'subscription',
          topic,
          data: { subscribed: true },
        }),
      );
    }
  }

  /**
   * Unsubscribe a WebSocket from a topic
   */
  private handleUnsubscribe(ws: WebSocket, topic?: string): void {
    if (!topic) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'Topic required for unsubscribe',
        }),
      );

      return;
    }

    const subscriptions = this.sessions.get(ws);

    if (subscriptions) {
      subscriptions.delete(topic);
      ws.send(
        JSON.stringify({
          type: 'subscription',
          topic,
          data: { subscribed: false },
        }),
      );
    }
  }

  /**
   * Handle broadcast request (internal API)
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    try {
      const { topic, payload } = (await request.json()) as {
        topic: string;
        payload: unknown;
      };

      let broadcastCount = 0;

      // Broadcast to all WebSockets subscribed to this topic
      for (const [ws, subscriptions] of this.sessions) {
        if (subscriptions.has(topic)) {
          ws.send(
            JSON.stringify({ type: 'subscription', topic, data: payload }),
          );
          broadcastCount++;
        }
      }

      return new Response(JSON.stringify({ success: true, broadcastCount }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid broadcast request' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }
}
