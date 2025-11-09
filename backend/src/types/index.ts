// Import Excalidraw types
import type { ExcalidrawElement } from '@excalidraw/excalidraw/dist/types/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/dist/types/excalidraw/types';

// Server extension of ExcalidrawElement
export interface ServerElement extends ExcalidrawElement {
  createdAt: string;  // ISO 8601 timestamp
  updatedAt: string;  // ISO 8601 timestamp
  syncedAt?: string;  // Last WebSocket sync timestamp
  source?: 'mcp' | 'frontend';  // Origin of last change
}

// Canvas container
export interface Canvas {
  id: string;  // Canvas identifier (default: 'main')
  elements: ServerElement[];  // All elements in canvas
  appState: Partial<AppState>;  // Canvas configuration
  createdAt: string;
  updatedAt: string;
  version: number;  // Canvas version for migrations
}

// WebSocket connection tracking
export interface WebSocketConnection {
  id: string;  // Connection ID (UUID)
  ws: any;  // WebSocket instance (using any to avoid ws type complexity)
  canvasId: string;  // Which canvas this connection observes
  connectedAt: Date;
  lastActivity: Date;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
  };
}

// WebSocket message types
export type WebSocketMessageType =
  | 'element_created'
  | 'element_updated'
  | 'element_deleted'
  | 'initial_elements'
  | 'elements_batch_created'
  | 'sync_request'
  | 'sync_to_backend'
  | 'sync_response'
  | 'elements_synced'
  | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  element?: ServerElement;
  elements?: ServerElement[];
  elementId?: string;
  canvasId?: string;
  timestamp: string;
  source?: 'mcp' | 'frontend';
  count?: number;
  error?: {
    code: string;
    message: string;
  };
}

// MCP Tool execution logging
export interface MCPToolExecution {
  id: string;  // Execution ID
  toolName: string;  // e.g., 'element_create'
  params: Record<string, any>;  // Tool input parameters
  result?: any;  // Tool output
  error?: {
    code: string;
    message: string;
    context?: Record<string, any>;
  };
  duration: number;  // Execution time in ms
  timestamp: string;  // ISO 8601
}

// Error codes
export const ERROR_CODES = {
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  INVALID_TYPE: 'INVALID_TYPE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ELEMENT_LOCKED: 'ELEMENT_LOCKED',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_ELEMENTS: 'INVALID_ELEMENTS',
  INSUFFICIENT_ELEMENTS: 'INSUFFICIENT_ELEMENTS',
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  SYNC_FAILED: 'SYNC_FAILED',
  CONNECTION_LIMIT: 'CONNECTION_LIMIT'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
