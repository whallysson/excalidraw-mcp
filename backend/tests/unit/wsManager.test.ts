/**
 * Unit tests for WSManager
 * Tests WebSocket connection management, broadcasting, and cleanup
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSManager } from '../../src/services/wsManager.js';
import type { WebSocket } from 'ws';
import type { WebSocketMessage } from '../../src/types/index.js';

// Mock WebSocket
const createMockWebSocket = (readyState: number = 1): WebSocket => ({
  readyState,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  ping: vi.fn()
} as any);

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  },
  logWebSocket: vi.fn()
}));

describe('WSManager', () => {
  let wsManager: WSManager;

  beforeEach(() => {
    vi.clearAllMocks();
    wsManager = new WSManager();
  });

  describe('addConnection', () => {
    it('should add a new WebSocket connection', () => {
      const mockWs = createMockWebSocket();
      
      const connectionId = wsManager.addConnection(mockWs, 'main');

      expect(connectionId).toBeDefined();
      expect(typeof connectionId).toBe('string');
      expect(wsManager.getConnectionCount()).toBe(1);
    });

    it('should add connection with metadata', () => {
      const mockWs = createMockWebSocket();
      const metadata = {
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1'
      };

      const connectionId = wsManager.addConnection(mockWs, 'main', metadata);

      expect(connectionId).toBeDefined();
      const connections = wsManager.getCanvasConnections('main');
      expect(connections.length).toBe(1);
      expect(connections[0].metadata).toEqual(metadata);
    });

    it('should assign connection to specified canvas', () => {
      const mockWs = createMockWebSocket();

      wsManager.addConnection(mockWs, 'canvas-123');

      expect(wsManager.getCanvasConnectionCount('canvas-123')).toBe(1);
      expect(wsManager.getCanvasConnectionCount('main')).toBe(0);
    });

    it('should support multiple connections to same canvas', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');
      wsManager.addConnection(ws3, 'main');

      expect(wsManager.getCanvasConnectionCount('main')).toBe(3);
    });

    it('should support connections to different canvases', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.addConnection(ws1, 'canvas-1');
      wsManager.addConnection(ws2, 'canvas-2');

      expect(wsManager.getCanvasConnectionCount('canvas-1')).toBe(1);
      expect(wsManager.getCanvasConnectionCount('canvas-2')).toBe(1);
      expect(wsManager.getConnectionCount()).toBe(2);
    });

    it('should setup event handlers on WebSocket', () => {
      const mockWs = createMockWebSocket();

      wsManager.addConnection(mockWs, 'main');

      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('pong', expect.any(Function));
    });
  });

  describe('removeConnection', () => {
    it('should remove an existing connection', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      wsManager.removeConnection(connectionId);

      expect(wsManager.getConnectionCount()).toBe(0);
    });

    it('should close WebSocket when removing connection', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      wsManager.removeConnection(connectionId);

      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should handle removing non-existent connection gracefully', () => {
      expect(() => {
        wsManager.removeConnection('non-existent-id');
      }).not.toThrow();
    });

    it('should not close WebSocket if already closed', () => {
      const mockWs = createMockWebSocket(3); // CLOSED state
      const connectionId = wsManager.addConnection(mockWs, 'main');

      wsManager.removeConnection(connectionId);

      expect(mockWs.close).not.toHaveBeenCalled();
    });
  });

  describe('sendToConnection', () => {
    it('should send message to specific connection', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      const message: WebSocketMessage = {
        type: 'test_message',
        timestamp: new Date().toISOString()
      };

      const result = wsManager.sendToConnection(connectionId, message);

      expect(result).toBe(true);
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should return false for non-existent connection', () => {
      const message: WebSocketMessage = {
        type: 'test_message',
        timestamp: new Date().toISOString()
      };

      const result = wsManager.sendToConnection('non-existent', message);

      expect(result).toBe(false);
    });

    it('should return false if WebSocket is not open', () => {
      const mockWs = createMockWebSocket(0); // CONNECTING state
      const connectionId = wsManager.addConnection(mockWs, 'main');

      const message: WebSocketMessage = {
        type: 'test_message',
        timestamp: new Date().toISOString()
      };

      const result = wsManager.sendToConnection(connectionId, message);

      expect(result).toBe(false);
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should update last activity timestamp on successful send', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      const message: WebSocketMessage = {
        type: 'test_message',
        timestamp: new Date().toISOString()
      };

      wsManager.sendToConnection(connectionId, message);

      const connections = wsManager.getCanvasConnections('main');
      expect(connections[0].lastActivity).toBeDefined();
    });
  });

  describe('broadcastToCanvas', () => {
    it('should broadcast message to all connections on canvas', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');
      wsManager.addConnection(ws3, 'main');

      const message: WebSocketMessage = {
        type: 'broadcast_test',
        timestamp: new Date().toISOString()
      };

      wsManager.broadcastToCanvas('main', message);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
      expect(ws3.send).toHaveBeenCalled();
    });

    it('should exclude sender from broadcast', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      const conn1 = wsManager.addConnection(ws1, 'main');
      const conn2 = wsManager.addConnection(ws2, 'main');
      wsManager.addConnection(ws3, 'main');

      const message: WebSocketMessage = {
        type: 'broadcast_test',
        timestamp: new Date().toISOString()
      };

      wsManager.broadcastToCanvas('main', message, conn2);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled(); // Excluded
      expect(ws3.send).toHaveBeenCalled();
    });

    it('should only broadcast to specified canvas', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.addConnection(ws1, 'canvas-1');
      wsManager.addConnection(ws2, 'canvas-2');

      const message: WebSocketMessage = {
        type: 'broadcast_test',
        timestamp: new Date().toISOString()
      };

      wsManager.broadcastToCanvas('canvas-1', message);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it('should skip connections with closed WebSockets', () => {
      const ws1 = createMockWebSocket(); // OPEN
      const ws2 = createMockWebSocket(3); // CLOSED

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');

      const message: WebSocketMessage = {
        type: 'broadcast_test',
        timestamp: new Date().toISOString()
      };

      wsManager.broadcastToCanvas('main', message);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it('should send same message object to all recipients', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');

      const message: WebSocketMessage = {
        type: 'broadcast_test',
        timestamp: new Date().toISOString()
      };

      wsManager.broadcastToCanvas('main', message);

      const sentMessage1 = (ws1.send as any).mock.calls[0][0];
      const sentMessage2 = (ws2.send as any).mock.calls[0][0];

      expect(sentMessage1).toBe(sentMessage2); // Same serialized string
    });
  });

  describe('getCanvasConnections', () => {
    it('should return all connections for a canvas', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');
      wsManager.addConnection(ws3, 'other');

      const mainConnections = wsManager.getCanvasConnections('main');
      expect(mainConnections.length).toBe(2);
      expect(mainConnections.every(conn => conn.canvasId === 'main')).toBe(true);
    });

    it('should return empty array for canvas with no connections', () => {
      const connections = wsManager.getCanvasConnections('empty-canvas');
      expect(connections).toEqual([]);
    });
  });

  describe('getConnectionCount', () => {
    it('should return total connection count', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      wsManager.addConnection(ws1, 'canvas-1');
      wsManager.addConnection(ws2, 'canvas-2');

      expect(wsManager.getConnectionCount()).toBe(2);
    });

    it('should return 0 when no connections', () => {
      expect(wsManager.getConnectionCount()).toBe(0);
    });
  });

  describe('getCanvasConnectionCount', () => {
    it('should return connection count for specific canvas', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const ws3 = createMockWebSocket();

      wsManager.addConnection(ws1, 'main');
      wsManager.addConnection(ws2, 'main');
      wsManager.addConnection(ws3, 'other');

      expect(wsManager.getCanvasConnectionCount('main')).toBe(2);
      expect(wsManager.getCanvasConnectionCount('other')).toBe(1);
    });

    it('should return 0 for canvas with no connections', () => {
      expect(wsManager.getCanvasConnectionCount('empty')).toBe(0);
    });
  });

  describe('sendInitialElements', () => {
    it('should send initial elements to connection', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      const elements = [
        { id: '1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100 },
        { id: '2', type: 'ellipse', x: 100, y: 100, width: 50, height: 50 }
      ];

      wsManager.sendInitialElements(connectionId, elements as any);

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('initial_elements'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"id":"1"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"id":"2"'));
    });
  });

  describe('updateLastActivity', () => {
    it('should update last activity timestamp', () => {
      const mockWs = createMockWebSocket();
      const connectionId = wsManager.addConnection(mockWs, 'main');

      const connectionsBefore = wsManager.getCanvasConnections('main');
      const timestampBefore = connectionsBefore[0].lastActivity;

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        wsManager.updateLastActivity(connectionId);

        const connectionsAfter = wsManager.getCanvasConnections('main');
        const timestampAfter = connectionsAfter[0].lastActivity;

        expect(timestampAfter.getTime()).toBeGreaterThanOrEqual(timestampBefore.getTime());
      }, 10);
    });

    it('should not throw error for non-existent connection', () => {
      expect(() => {
        wsManager.updateLastActivity('non-existent');
      }).not.toThrow();
    });
  });
});
