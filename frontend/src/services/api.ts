/**
 * API Service
 * HTTP client for communicating with backend MCP server
 */

import type { ServerElement } from '../types';

const API_BASE_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3333';

/**
 * API response types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface CanvasStateResponse {
  elements: ServerElement[];
  appState: Record<string, any>;
  metadata: {
    elementCount: number;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  metrics: {
    canvasElementCount: number;
    activeWebSocketConnections: number;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    lastSaveTimestamp: string;
  };
  dependencies: Record<string, string>;
}

/**
 * Fetch wrapper with error handling
 */
async function fetchJSON<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        code: 'HTTP_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));

      return {
        success: false,
        error,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown network error',
      },
    };
  }
}

/**
 * Get canvas state from backend
 */
export async function getCanvasState(canvasId = 'main'): Promise<ApiResponse<CanvasStateResponse>> {
  return fetchJSON<CanvasStateResponse>(`${API_BASE_URL}/api/canvas/${canvasId}`);
}

/**
 * Sync elements to backend
 */
export async function syncElementsToBackend(
  canvasId = 'main',
  elements: ServerElement[]
): Promise<ApiResponse<{ synced: number }>> {
  return fetchJSON<{ synced: number }>(`${API_BASE_URL}/api/canvas/${canvasId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ elements }),
  });
}

/**
 * Get health status
 */
export async function getHealth(): Promise<ApiResponse<HealthResponse>> {
  return fetchJSON<HealthResponse>(`${API_BASE_URL}/health`);
}

/**
 * Call MCP tool via HTTP
 */
export async function callMCPTool(
  toolName: string,
  args: Record<string, any>
): Promise<ApiResponse<any>> {
  return fetchJSON(`${API_BASE_URL}/mcp`, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });
}

/**
 * Read MCP resource via HTTP
 */
export async function readMCPResource(uri: string): Promise<ApiResponse<any>> {
  return fetchJSON(`${API_BASE_URL}/mcp`, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: {
        uri,
      },
    }),
  });
}

/**
 * Ping server to check connectivity
 */
export async function ping(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}
