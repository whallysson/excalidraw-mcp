/**
 * WebSocket Hook
 * Manages WebSocket connection with automatic reconnection and message buffering
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebSocketMessage } from '../types';

export interface UseWebSocketOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectOnClose?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  send: (message: WebSocketMessage) => void;
  reconnect: () => void;
  disconnect: () => void;
}

/**
 * Custom hook for WebSocket connection management
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message buffering for offline state
 * - Connection status tracking
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectOnClose = true,
    reconnectAttempts = 10,
    reconnectInterval = 1000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const messageBufferRef = useRef<WebSocketMessage[]>([]);
  const intentionalCloseRef = useRef(false);

  // Keep refs updated with latest callbacks to avoid stale closures
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs whenever callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onMessage, onConnect, onDisconnect, onError]);

  /**
   * Calculate exponential backoff delay
   */
  const getReconnectDelay = useCallback((attempt: number): number => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    const delay = Math.min(reconnectInterval * Math.pow(2, attempt), 32000);
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }, [reconnectInterval]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectCountRef.current = 0;
        onConnectRef.current?.();

        // Send buffered messages
        if (messageBufferRef.current.length > 0) {
          messageBufferRef.current.forEach((msg) => {
            ws.send(JSON.stringify(msg));
          });
          messageBufferRef.current = [];
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch (error) {
          // Failed to parse message
        }
      };

      ws.onerror = (error) => {
        onErrorRef.current?.(error);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        onDisconnectRef.current?.();

        // Reconnect if not intentional close
        if (reconnectOnClose && !intentionalCloseRef.current) {
          if (reconnectCountRef.current < reconnectAttempts) {
            const delay = getReconnectDelay(reconnectCountRef.current);

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectCountRef.current++;
              connect();
            }, delay);
          }
        }

        // Reset intentional close flag
        intentionalCloseRef.current = false;
      };
    } catch (error) {
      // Failed to create connection
    }
  }, [url, reconnectOnClose, reconnectAttempts, getReconnectDelay]);

  /**
   * Send message to server (with buffering)
   */
  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Buffer message for later
      messageBufferRef.current.push(message);

      // Limit buffer size (max 100 messages)
      if (messageBufferRef.current.length > 100) {
        messageBufferRef.current.shift();
      }
    }
  }, []);

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(() => {
    disconnect();
    reconnectCountRef.current = 0;
    connect();
  }, [connect]);

  /**
   * Disconnect from server
   */
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;

    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close WebSocket connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Connect on mount (only once)
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]); // Only reconnect if URL changes

  return {
    isConnected,
    send,
    reconnect,
    disconnect,
  };
}
