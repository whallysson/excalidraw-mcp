import type { WebSocket } from 'ws';
import type { WebSocketConnection, WebSocketMessage, ServerElement } from '../types/index.js';
import { ERROR_CODES } from '../types/index.js';
import { logger, logWebSocket } from '../utils/logger.js';
import { generateUUID } from '../utils/id.js';

/**
 * WebSocket connection manager
 * Tracks active connections and handles message broadcasting
 */
export class WSManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private readonly MAX_CONNECTIONS = 1000;  // Safety limit (higher for dev due to React StrictMode)
  private readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000;  // 5 minutes

  constructor() {
    // Start periodic cleanup of inactive connections
    this.startInactivityCleanup();
  }

  /**
   * Add a new WebSocket connection
   */
  addConnection(
    ws: WebSocket,
    canvasId: string = 'main',
    metadata?: { userAgent?: string; ipAddress?: string }
  ): string {
    // Check connection limit
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      logger.warn('Connection limit reached', { limit: this.MAX_CONNECTIONS });
      ws.close(1008, 'Connection limit reached');
      throw new Error(ERROR_CODES.CONNECTION_LIMIT);
    }

    const connectionId = generateUUID();
    const now = new Date();

    const connection: WebSocketConnection = {
      id: connectionId,
      ws,
      canvasId,
      connectedAt: now,
      lastActivity: now,
      metadata: metadata || {}
    };

    this.connections.set(connectionId, connection);

    // Setup connection handlers
    this.setupConnectionHandlers(connectionId, ws);

    logWebSocket('connection_added', connectionId, {
      canvasId,
      totalConnections: this.connections.size
    });

    return connectionId;
  }

  /**
   * Setup WebSocket event handlers for a connection
   */
  private setupConnectionHandlers(connectionId: string, ws: WebSocket): void {
    // Handle connection close
    ws.on('close', () => {
      this.removeConnection(connectionId);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { connectionId, error });
      this.removeConnection(connectionId);
    });

    // Handle pong (keep-alive)
    ws.on('pong', () => {
      this.updateLastActivity(connectionId);
    });
  }

  /**
   * Remove a connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Close WebSocket if still open
      if (connection.ws.readyState === 1) {  // OPEN
        connection.ws.close();
      }
    } catch (error) {
      logger.error('Error closing WebSocket', { connectionId, error });
    }

    this.connections.delete(connectionId);

    logWebSocket('connection_removed', connectionId, {
      totalConnections: this.connections.size
    });
  }

  /**
   * Update last activity timestamp for a connection
   */
  updateLastActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Broadcast message to all connections for a canvas (excluding sender)
   */
  broadcastToCanvas(
    canvasId: string,
    message: WebSocketMessage,
    excludeConnectionId?: string
  ): void {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const [connId, connection] of this.connections.entries()) {
      // Skip if different canvas or if this is the sender
      if (connection.canvasId !== canvasId || connId === excludeConnectionId) {
        continue;
      }

      // Check if WebSocket is open
      if (connection.ws.readyState !== 1) {  // Not OPEN
        continue;
      }

      try {
        connection.ws.send(messageStr);
        sentCount++;
        this.updateLastActivity(connId);
      } catch (error) {
        logger.error('Failed to send message', { connectionId: connId, error });
        this.removeConnection(connId);
      }
    }

    logWebSocket('broadcast', canvasId, {
      messageType: message.type,
      recipientCount: sentCount,
      excludedConnection: excludeConnectionId
    });
  }

  /**
   * Send message to a specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      logger.warn('Connection not found', { connectionId });
      return false;
    }

    if (connection.ws.readyState !== 1) {  // Not OPEN
      logger.warn('WebSocket not open', { connectionId, readyState: connection.ws.readyState });
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      this.updateLastActivity(connectionId);
      return true;
    } catch (error) {
      logger.error('Failed to send message to connection', { connectionId, error });
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Get all active connections for a canvas
   */
  getCanvasConnections(canvasId: string): WebSocketConnection[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.canvasId === canvasId);
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection count for a specific canvas
   */
  getCanvasConnectionCount(canvasId: string): number {
    return this.getCanvasConnections(canvasId).length;
  }

  /**
   * Broadcast element created event
   */
  broadcastElementCreated(
    canvasId: string,
    element: ServerElement,
    source: 'mcp' | 'frontend' = 'mcp',
    excludeConnectionId?: string
  ): void {
    const message: WebSocketMessage = {
      type: 'element_created',
      element,
      timestamp: new Date().toISOString(),
      source
    };

    this.broadcastToCanvas(canvasId, message, excludeConnectionId);
  }

  /**
   * Broadcast element updated event
   */
  broadcastElementUpdated(
    canvasId: string,
    element: ServerElement,
    source: 'mcp' | 'frontend' = 'mcp',
    excludeConnectionId?: string
  ): void {
    const message: WebSocketMessage = {
      type: 'element_updated',
      element,
      timestamp: new Date().toISOString(),
      source
    };

    this.broadcastToCanvas(canvasId, message, excludeConnectionId);
  }

  /**
   * Broadcast element deleted event
   */
  broadcastElementDeleted(
    canvasId: string,
    elementId: string,
    source: 'mcp' | 'frontend' = 'mcp',
    excludeConnectionId?: string
  ): void {
    const message: WebSocketMessage = {
      type: 'element_deleted',
      elementId,
      timestamp: new Date().toISOString(),
      source
    };

    this.broadcastToCanvas(canvasId, message, excludeConnectionId);
  }

  /**
   * Send initial elements to a connection
   */
  sendInitialElements(
    connectionId: string,
    elements: ServerElement[]
  ): boolean {
    const message: WebSocketMessage = {
      type: 'initial_elements',
      elements,
      timestamp: new Date().toISOString()
    };

    return this.sendToConnection(connectionId, message);
  }

  /**
   * Start periodic cleanup of inactive connections
   */
  private startInactivityCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const inactiveConnections: string[] = [];

      for (const [connId, connection] of this.connections.entries()) {
        const inactiveTime = now - connection.lastActivity.getTime();

        if (inactiveTime > this.INACTIVITY_TIMEOUT) {
          inactiveConnections.push(connId);
        } else if (connection.ws.readyState === 1) {
          // Send ping to active connections
          try {
            connection.ws.ping();
          } catch (error) {
            logger.error('Failed to ping connection', { connectionId: connId, error });
            inactiveConnections.push(connId);
          }
        }
      }

      // Remove inactive connections
      for (const connId of inactiveConnections) {
        logger.info('Removing inactive connection', { connectionId: connId });
        this.removeConnection(connId);
      }
    }, 60000);  // Check every minute
  }
}

// Singleton instance
let wsManagerInstance: WSManager | null = null;

/**
 * Get or create WSManager instance
 */
export function getWSManager(): WSManager {
  if (!wsManagerInstance) {
    wsManagerInstance = new WSManager();
  }
  return wsManagerInstance;
}

export default WSManager;
