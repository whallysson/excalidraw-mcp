import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { logger } from '../../utils/logger.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Register canvas state resource
 * Exposes read-only access to current canvas state
 */
export function registerCanvasResources(server: Server): void {
  const canvasManager = getCanvasManager();

  // Resource: canvas://main/state
  server.setRequestHandler(
    {
      method: 'resources/read',
      schema: {
        uri: `canvas://${CANVAS_ID}/state`
      }
    },
    async () => {
      try {
        const canvas = await canvasManager.getCanvas(CANVAS_ID);
        const activeElements = canvasManager.getActiveElements(CANVAS_ID);

        const response = {
          elements: activeElements,
          appState: canvas.appState,
          metadata: {
            elementCount: activeElements.length,
            createdAt: canvas.createdAt,
            updatedAt: canvas.updatedAt,
            version: canvas.version
          }
        };

        logger.info('Canvas state resource accessed', {
          canvasId: CANVAS_ID,
          elementCount: activeElements.length
        });

        return {
          contents: [{
            uri: `canvas://${CANVAS_ID}/state`,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Failed to read canvas state', { error, canvasId: CANVAS_ID });

        return {
          contents: [{
            uri: `canvas://${CANVAS_ID}/state`,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to read canvas state: ${error}`
              }
            })
          }]
        };
      }
    }
  );

  // List available canvas resources
  server.setRequestHandler(
    {
      method: 'resources/list'
    },
    async () => {
      return {
        resources: [
          {
            uri: `canvas://${CANVAS_ID}/state`,
            name: 'Canvas State',
            description: 'Current canvas elements and configuration',
            mimeType: 'application/json'
          }
        ]
      };
    }
  );
}
