import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logMCPTool } from '../../utils/logger.js';
import {
  elementCreateSchema,
  elementUpdateSchema,
  elementDeleteSchema,
  elementQuerySchema,
  type ElementCreateInput,
  type ElementUpdateInput,
  type ElementDeleteInput,
  type ElementQueryInput
} from '../schemas/index.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Register all element-related MCP tools
 */
export function registerElementTools(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Tool: element_create
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('element_create'),
        arguments: elementCreateSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as ElementCreateInput;

      try {
        const result = await canvasManager.createElement(CANVAS_ID, args as any);

        if (!result.success || !result.element) {
          logMCPTool('element_create', args, null, result.error, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error
              })
            }],
            isError: true
          };
        }

        // Broadcast to WebSocket clients
        wsManager.broadcastElementCreated(CANVAS_ID, result.element, 'mcp');

        logMCPTool('element_create', args, result, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              element: result.element
            })
          }]
        };
      } catch (error) {
        logMCPTool('element_create', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to create element: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: element_update
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('element_update'),
        arguments: elementUpdateSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as ElementUpdateInput;

      try {
        const { id, ...updates } = args;
        const result = await canvasManager.updateElement(CANVAS_ID, id, updates as any);

        if (!result.success || !result.element) {
          logMCPTool('element_update', args, null, result.error, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error
              })
            }],
            isError: true
          };
        }

        // Broadcast to WebSocket clients
        wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');

        logMCPTool('element_update', args, result, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              element: result.element
            })
          }]
        };
      } catch (error) {
        logMCPTool('element_update', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to update element: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: element_delete
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('element_delete'),
        arguments: elementDeleteSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as ElementDeleteInput;

      try {
        const result = await canvasManager.deleteElement(CANVAS_ID, args.id);

        if (!result.success || !result.deletedId) {
          logMCPTool('element_delete', args, null, result.error, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: result.error
              })
            }],
            isError: true
          };
        }

        // Broadcast to WebSocket clients
        wsManager.broadcastElementDeleted(CANVAS_ID, result.deletedId, 'mcp');

        logMCPTool('element_delete', args, result, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              deletedId: result.deletedId
            })
          }]
        };
      } catch (error) {
        logMCPTool('element_delete', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to delete element: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: element_query
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('element_query'),
        arguments: elementQuerySchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as ElementQueryInput;

      try {
        let elements = canvasManager.getActiveElements(CANVAS_ID);

        // Apply filters
        if (args.type) {
          elements = elements.filter(el => el.type === args.type);
        }

        if (args.inGroup) {
          elements = elements.filter(el =>
            el.groupIds && el.groupIds.includes(args.inGroup!)
          );
        }

        if (args.locked !== undefined) {
          elements = elements.filter(el => el.locked === args.locked);
        }

        // Apply limit
        const limit = args.limit || 100;
        elements = elements.slice(0, limit);

        logMCPTool('element_query', args, { count: elements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              elements,
              count: elements.length
            })
          }]
        };
      } catch (error) {
        logMCPTool('element_query', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to query elements: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );
}
