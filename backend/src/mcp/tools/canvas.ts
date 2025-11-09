import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logMCPTool } from '../../utils/logger.js';
import {
  canvasClearSchema,
  canvasExportSchema,
  canvasImportSchema,
  type CanvasClearInput,
  type CanvasExportInput,
  type CanvasImportInput
} from '../schemas/index.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Register all canvas-related MCP tools
 */
export function registerCanvasTools(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Tool: canvas_clear
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('canvas_clear'),
        arguments: canvasClearSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as CanvasClearInput;

      try {
        // Require confirmation to prevent accidental clears
        if (!args.confirm) {
          logMCPTool('canvas_clear', args, null, { code: 'CONFIRMATION_REQUIRED' }, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'CONFIRMATION_REQUIRED',
                  message: 'Confirmation required. Set confirm: true to clear canvas.'
                }
              })
            }],
            isError: true
          };
        }

        const result = await canvasManager.clearCanvas(CANVAS_ID);

        if (!result.success) {
          logMCPTool('canvas_clear', args, null, result.error, Date.now() - startTime);

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

        // Broadcast canvas cleared event
        wsManager.broadcastToCanvas(CANVAS_ID, {
          type: 'canvas_cleared',
          timestamp: new Date().toISOString(),
          source: 'mcp'
        });

        logMCPTool('canvas_clear', args, result, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              deletedCount: result.deletedCount
            })
          }]
        };
      } catch (error) {
        logMCPTool('canvas_clear', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to clear canvas: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: canvas_export
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('canvas_export'),
        arguments: canvasExportSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as CanvasExportInput;

      try {
        const canvas = await canvasManager.getCanvas(CANVAS_ID);

        // Filter elements based on includeDeleted flag
        let elements = args.includeDeleted
          ? canvas.elements
          : canvas.elements.filter(el => !el.isDeleted);

        // Create export data based on format
        const exportData = {
          type: 'excalidraw' as const,
          version: 2,
          source: 'excalidraw-mcp-server',
          elements: elements,
          appState: canvas.appState,
          files: {}
        };

        logMCPTool('canvas_export', args, { elementCount: elements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              format: args.format,
              data: args.format === 'json' ? JSON.stringify(exportData, null, 2) : exportData,
              elementCount: elements.length
            })
          }]
        };
      } catch (error) {
        logMCPTool('canvas_export', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to export canvas: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: canvas_import
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('canvas_import'),
        arguments: canvasImportSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as CanvasImportInput;

      try {
        // Parse import data
        let importData: any;
        try {
          importData = JSON.parse(args.data);
        } catch (parseError) {
          logMCPTool('canvas_import', args, null, { code: 'INVALID_DATA' }, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'INVALID_DATA',
                  message: 'Invalid JSON data provided'
                }
              })
            }],
            isError: true
          };
        }

        // Validate that it has elements array
        if (!importData.elements || !Array.isArray(importData.elements)) {
          logMCPTool('canvas_import', args, null, { code: 'INVALID_FORMAT' }, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'INVALID_FORMAT',
                  message: 'Import data must contain elements array'
                }
              })
            }],
            isError: true
          };
        }

        // Clear canvas if not merging
        if (!args.merge) {
          await canvasManager.clearCanvas(CANVAS_ID);
        }

        // Import elements
        let importedCount = 0;
        const importedElements = [];

        for (const elementData of importData.elements) {
          // Skip deleted elements unless explicitly included
          if (elementData.isDeleted && !args.merge) {
            continue;
          }

          const result = await canvasManager.createElement(CANVAS_ID, elementData);
          if (result.success && result.element) {
            importedCount++;
            importedElements.push(result.element);

            // Broadcast element created
            wsManager.broadcastElementCreated(CANVAS_ID, result.element, 'mcp');
          }
        }

        logMCPTool('canvas_import', args, { importedCount }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              importedCount,
              merge: args.merge,
              elements: importedElements
            })
          }]
        };
      } catch (error) {
        logMCPTool('canvas_import', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to import canvas: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );
}
