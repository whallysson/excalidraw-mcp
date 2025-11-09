/**
 * Frontend Type Definitions
 * Imports core types from Excalidraw and defines frontend-specific types
 */

import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types/types';

// Re-export core Excalidraw types
export type { ExcalidrawElement, AppState, BinaryFiles };

/**
 * Extended element with server metadata
 * Matches backend ServerElement type
 */
export interface ServerElement extends ExcalidrawElement {
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  source?: 'mcp' | 'frontend';
}

/**
 * Canvas state persisted to localStorage
 */
export interface PersistedCanvasState {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  version: number;
  lastSaved: string;
}

/**
 * WebSocket message types for real-time sync
 */
export type WebSocketMessageType =
  | 'element_created'
  | 'element_updated'
  | 'element_deleted'
  | 'sync_request'
  | 'sync_response'
  | 'sync_to_backend';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  canvasId: string;
  element?: ServerElement;
  elements?: ServerElement[];
  timestamp: string;
  source?: 'mcp' | 'frontend';
}

/**
 * Theme types for theme management
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Export format options
 */
export type ExportFormat = 'png' | 'svg' | 'json';

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  CANVAS_STATE: 'excalidraw-canvas-state',
  VIEWPORT: 'excalidraw-viewport',
  THEME: 'excalidraw-theme',
} as const;
