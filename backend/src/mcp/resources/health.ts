import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logger } from '../../utils/logger.js';

/**
 * Register health check resource
 * Exposes server health metrics and status
 */
export function registerHealthResource(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Resource: health://check
  server.setRequestHandler(
    {
      method: 'resources/read',
      schema: {
        uri: 'health://check'
      }
    },
    async () => {
      try {
        const canvas = await canvasManager.getCanvas('main');
        const elementCount = canvasManager.getActiveElements('main').length;
        const wsConnections = wsManager.getConnectionCount();
        const memUsage = process.memoryUsage();

        // Determine health status
        const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
        let status: 'healthy' | 'degraded' | 'unhealthy';

        if (memoryUsagePercent > 0.9 || elementCount > 10000) {
          status = 'unhealthy';
        } else if (memoryUsagePercent > 0.8 || elementCount > 8000) {
          status = 'degraded';
        } else {
          status = 'healthy';
        }

        const response = {
          status,
          uptime: process.uptime(),
          metrics: {
            canvasElementCount: elementCount,
            activeWebSocketConnections: wsConnections,
            memoryUsage: {
              heapUsed: memUsage.heapUsed,
              heapTotal: memUsage.heapTotal,
              external: memUsage.external
            },
            lastSaveTimestamp: canvas.updatedAt
          },
          dependencies: {
            '@modelcontextprotocol/sdk': '^1.0.4',
            '@excalidraw/excalidraw': '^0.18.0',
            node: process.version
          }
        };

        logger.info('Health check accessed', {
          status,
          elementCount,
          wsConnections,
          memoryUsagePercent: Math.round(memoryUsagePercent * 100)
        });

        return {
          contents: [{
            uri: 'health://check',
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Health check failed', { error });

        return {
          contents: [{
            uri: 'health://check',
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'unhealthy',
              error: {
                code: 'INTERNAL_ERROR',
                message: `Health check failed: ${error}`
              }
            })
          }]
        };
      }
    }
  );
}
