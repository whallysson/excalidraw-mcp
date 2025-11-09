import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logMCPTool } from '../../utils/logger.js';
import {
  alignElementsSchema,
  distributeElementsSchema,
  type AlignElementsInput,
  type DistributeElementsInput
} from '../schemas/index.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Register all layout-related MCP tools
 */
export function registerLayoutTools(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Tool: align_elements
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('align_elements'),
        arguments: alignElementsSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as AlignElementsInput;

      try {
        // Validate and fetch all elements
        const elements = [];
        for (const elementId of args.elementIds) {
          const element = canvasManager.getElementById(CANVAS_ID, elementId);
          if (!element) {
            logMCPTool('align_elements', args, null, { code: 'ELEMENT_NOT_FOUND' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_NOT_FOUND',
                    message: `Element ${elementId} not found`
                  }
                })
              }],
              isError: true
            };
          }

          if (element.locked) {
            logMCPTool('align_elements', args, null, { code: 'ELEMENT_LOCKED' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_LOCKED',
                    message: `Element ${elementId} is locked`
                  }
                })
              }],
              isError: true
            };
          }

          elements.push(element);
        }

        // Calculate alignment positions based on type
        const updatedElements = [];
        let alignPosition: number;

        switch (args.alignment) {
          case 'left':
            alignPosition = Math.min(...elements.map(el => el.x));
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                x: alignPosition
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;

          case 'center':
            alignPosition = elements.reduce((sum, el) => sum + (el.x + (el.width || 0) / 2), 0) / elements.length;
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                x: alignPosition - (element.width || 0) / 2
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;

          case 'right':
            alignPosition = Math.max(...elements.map(el => el.x + (el.width || 0)));
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                x: alignPosition - (element.width || 0)
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;

          case 'top':
            alignPosition = Math.min(...elements.map(el => el.y));
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                y: alignPosition
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;

          case 'middle':
            alignPosition = elements.reduce((sum, el) => sum + (el.y + (el.height || 0) / 2), 0) / elements.length;
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                y: alignPosition - (element.height || 0) / 2
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;

          case 'bottom':
            alignPosition = Math.max(...elements.map(el => el.y + (el.height || 0)));
            for (const element of elements) {
              const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
                y: alignPosition - (element.height || 0)
              });
              if (result.success && result.element) {
                updatedElements.push(result.element);
                wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
              }
            }
            break;
        }

        logMCPTool('align_elements', args, { updatedCount: updatedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              alignment: args.alignment,
              updatedCount: updatedElements.length,
              elementIds: updatedElements.map(el => el.id)
            })
          }]
        };
      } catch (error) {
        logMCPTool('align_elements', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to align elements: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: distribute_elements
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('distribute_elements'),
        arguments: distributeElementsSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as DistributeElementsInput;

      try {
        // Validate and fetch all elements
        const elements = [];
        for (const elementId of args.elementIds) {
          const element = canvasManager.getElementById(CANVAS_ID, elementId);
          if (!element) {
            logMCPTool('distribute_elements', args, null, { code: 'ELEMENT_NOT_FOUND' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_NOT_FOUND',
                    message: `Element ${elementId} not found`
                  }
                })
              }],
              isError: true
            };
          }

          if (element.locked) {
            logMCPTool('distribute_elements', args, null, { code: 'ELEMENT_LOCKED' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_LOCKED',
                    message: `Element ${elementId} is locked`
                  }
                })
              }],
              isError: true
            };
          }

          elements.push(element);
        }

        // Sort elements and distribute them evenly
        const updatedElements = [];

        if (args.direction === 'horizontal') {
          // Sort by x position
          elements.sort((a, b) => a.x - b.x);

          const firstX = elements[0].x;
          const lastX = elements[elements.length - 1].x + (elements[elements.length - 1].width || 0);
          const totalSpace = lastX - firstX;
          const spacing = totalSpace / (elements.length - 1);

          for (let i = 1; i < elements.length - 1; i++) {
            const newX = firstX + (spacing * i);
            const result = await canvasManager.updateElement(CANVAS_ID, elements[i].id, {
              x: newX
            });
            if (result.success && result.element) {
              updatedElements.push(result.element);
              wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
            }
          }
        } else {
          // Sort by y position
          elements.sort((a, b) => a.y - b.y);

          const firstY = elements[0].y;
          const lastY = elements[elements.length - 1].y + (elements[elements.length - 1].height || 0);
          const totalSpace = lastY - firstY;
          const spacing = totalSpace / (elements.length - 1);

          for (let i = 1; i < elements.length - 1; i++) {
            const newY = firstY + (spacing * i);
            const result = await canvasManager.updateElement(CANVAS_ID, elements[i].id, {
              y: newY
            });
            if (result.success && result.element) {
              updatedElements.push(result.element);
              wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
            }
          }
        }

        logMCPTool('distribute_elements', args, { updatedCount: updatedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              direction: args.direction,
              updatedCount: updatedElements.length,
              elementIds: updatedElements.map(el => el.id)
            })
          }]
        };
      } catch (error) {
        logMCPTool('distribute_elements', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to distribute elements: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );
}
