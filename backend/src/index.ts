#!/usr/bin/env node

/**
 * MCP Server Entry Point
 * Initializes and starts the Excalidraw MCP server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { logger } from './utils/logger.js';
import { getCanvasManager } from './services/canvasManager.js';
import { getStorage } from './services/storage.js';

const SERVER_NAME = process.env.SERVER_NAME || 'excalidraw-mcp-server';
const SERVER_VERSION = process.env.SERVER_VERSION || '1.0.0';
const CANVAS_ID = 'main';
const HTTP_SERVER_URL = process.env.HTTP_SERVER_URL || 'http://localhost:3333';

/**
 * Initialize and start MCP server
 */
async function main() {
  try {
    // Initialize storage
    const storage = getStorage();
    await storage.initialize();

    // Initialize canvas manager
    const canvasManager = getCanvasManager();

    logger.info('Initializing MCP server', {
      name: SERVER_NAME,
      version: SERVER_VERSION
    });

    // Create MCP server instance (new API)
    const server = new McpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION
    });

    // Register tool: element_create
    server.registerTool(
      'element_create',
      {
        title: 'Create Element',
        description: 'Create a new element in the canvas (all Excalidraw types supported)',
        inputSchema: {
          type: z.enum([
            'rectangle',
            'ellipse',
            'diamond',
            'arrow',
            'text',
            'line',
            'freedraw',
            'image',
            'frame',
            'embeddable',
            'magicframe'
          ]),
          x: z.number(),
          y: z.number(),
          width: z.number().optional(),
          height: z.number().optional(),
          text: z.string().optional(),
          strokeColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          // Propriedades específicas para cada tipo
          points: z.array(z.array(z.number())).optional(),  // Para freedraw, arrows, lines
          fileId: z.string().optional(),  // Para image
          scale: z.array(z.number()).optional(),  // Para image [scaleX, scaleY]
          name: z.string().optional(),  // Para frame
          label: z.object({  // Label para qualquer elemento
            text: z.string(),
            fontSize: z.number().optional(),
            strokeColor: z.string().optional()
          }).optional()
        },
        outputSchema: {
          success: z.boolean(),
          element: z.any().optional(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const result = await canvasManager.createElement(CANVAS_ID, params as any);

          // Notificar servidor HTTP principal para fazer broadcast via WebSocket
          if (result.success && result.element) {
            try {
              // Fazer HTTP POST para endpoint de broadcast do servidor principal
              const response = await fetch(`${HTTP_SERVER_URL}/api/canvas/${CANVAS_ID}/broadcast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'element_created',
                  element: result.element,
                  source: 'mcp'
                })
              });

              if (response.ok) {
                logger.info('Element broadcast via HTTP to WebSocket server', {
                  elementId: result.element.id,
                  type: result.element.type
                });
              } else {
                logger.warn('Failed to broadcast element', {
                  status: response.status,
                  elementId: result.element.id
                });
              }
            } catch (broadcastError) {
              logger.warn('Failed to notify HTTP server for broadcast', {
                error: broadcastError,
                elementId: result.element.id
              });
            }
          }

          const output = {
            success: result.success,
            element: result.element,
            error: result.error
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: element_update
    server.registerTool(
      'element_update',
      {
        title: 'Update Element',
        description: 'Update an existing element in the canvas',
        inputSchema: {
          id: z.string(),
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          text: z.string().optional(),
          strokeColor: z.string().optional(),
          backgroundColor: z.string().optional()
        },
        outputSchema: {
          success: z.boolean(),
          element: z.any().optional(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const result = await canvasManager.updateElement(CANVAS_ID, params as any);

          const output = {
            success: result.success,
            element: result.element,
            error: result.error
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: element_delete
    server.registerTool(
      'element_delete',
      {
        title: 'Delete Element',
        description: 'Delete an element from the canvas',
        inputSchema: {
          id: z.string()
        },
        outputSchema: {
          success: z.boolean(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const result = await canvasManager.deleteElement(CANVAS_ID, params.id);

          const output = {
            success: result.success,
            error: result.error
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: get_canvas_state
    server.registerTool(
      'get_canvas_state',
      {
        title: 'Get Canvas State',
        description: 'Get the current state of the canvas',
        inputSchema: {},
        outputSchema: {
          success: z.boolean(),
          elementCount: z.number(),
          elements: z.array(z.any()),
          error: z.string().optional()
        }
      },
      async () => {
        try {
          const canvas = await canvasManager.getCanvas(CANVAS_ID);
          const elements = canvasManager.getActiveElements(CANVAS_ID);

          const output = {
            success: true,
            elementCount: elements.length,
            elements
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, elementCount: 0, elements: [], error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: batch_create_elements
    server.registerTool(
      'batch_create_elements',
      {
        title: 'Batch Create Elements',
        description: 'Create multiple elements at once (more efficient than creating one by one)',
        inputSchema: {
          elements: z.array(z.object({
            type: z.enum([
              'rectangle',
              'ellipse',
              'diamond',
              'arrow',
              'text',
              'line',
              'freedraw',
              'image',
              'frame'
            ]),
            x: z.number(),
            y: z.number(),
            width: z.number().optional(),
            height: z.number().optional(),
            text: z.string().optional(),
            strokeColor: z.string().optional(),
            backgroundColor: z.string().optional(),
            points: z.array(z.array(z.number())).optional(),
            fileId: z.string().optional(),
            name: z.string().optional(),
            label: z.object({
              text: z.string(),
              fontSize: z.number().optional(),
              strokeColor: z.string().optional()
            }).optional()
          }))
        },
        outputSchema: {
          success: z.boolean(),
          created: z.number(),
          elements: z.array(z.any()).optional(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const createdElements: any[] = [];
          let successCount = 0;

          for (const elementData of params.elements) {
            const result = await canvasManager.createElement(CANVAS_ID, elementData as any);
            if (result.success && result.element) {
              createdElements.push(result.element);
              successCount++;

              // Broadcast each element
              try {
                await fetch(`${HTTP_SERVER_URL}/api/canvas/${CANVAS_ID}/broadcast`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'element_created',
                    element: result.element,
                    source: 'mcp'
                  })
                });
              } catch (broadcastError) {
                logger.warn('Failed to broadcast element in batch', { error: broadcastError });
              }
            }
          }

          const output = {
            success: true,
            created: successCount,
            elements: createdElements
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, created: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: clear_canvas
    server.registerTool(
      'clear_canvas',
      {
        title: 'Clear Canvas',
        description: 'Remove all elements from the canvas',
        inputSchema: {},
        outputSchema: {
          success: z.boolean(),
          deletedCount: z.number(),
          error: z.string().optional()
        }
      },
      async () => {
        try {
          const result = await canvasManager.clearCanvas(CANVAS_ID);

          const output = {
            success: result.success,
            deletedCount: result.deletedCount
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, deletedCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: canvas_export
    server.registerTool(
      'canvas_export',
      {
        title: 'Export Canvas',
        description: 'Export canvas data in JSON or Excalidraw format',
        inputSchema: {
          format: z.enum(['json', 'excalidraw']).optional().default('json'),
          includeDeleted: z.boolean().optional().default(false)
        },
        outputSchema: {
          success: z.boolean(),
          format: z.string(),
          data: z.any(),
          elementCount: z.number(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const canvas = await canvasManager.getCanvas(CANVAS_ID);
          const elements = params.includeDeleted
            ? canvas.elements
            : canvas.elements.filter(el => !el.isDeleted);

          const exportData = {
            type: 'excalidraw' as const,
            version: 2,
            source: 'excalidraw-mcp-server',
            elements,
            appState: canvas.appState,
            files: {}
          };

          const output = {
            success: true,
            format: params.format || 'json',
            data: params.format === 'json' ? JSON.stringify(exportData, null, 2) : exportData,
            elementCount: elements.length
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, format: 'json', data: null, elementCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: canvas_import
    server.registerTool(
      'canvas_import',
      {
        title: 'Import Canvas',
        description: 'Import canvas data from JSON (merge or replace)',
        inputSchema: {
          data: z.string().min(1),
          merge: z.boolean().optional().default(false)
        },
        outputSchema: {
          success: z.boolean(),
          importedCount: z.number(),
          merge: z.boolean(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          let importData: any;
          try {
            importData = JSON.parse(params.data);
          } catch {
            throw new Error('Invalid JSON data provided');
          }

          if (!importData.elements || !Array.isArray(importData.elements)) {
            throw new Error('Import data must contain elements array');
          }

          if (!params.merge) {
            await canvasManager.clearCanvas(CANVAS_ID);
          }

          let importedCount = 0;
          for (const elementData of importData.elements) {
            if (elementData.isDeleted && !params.merge) continue;

            const result = await canvasManager.createElement(CANVAS_ID, elementData);
            if (result.success) importedCount++;
          }

          const output = { success: true, importedCount, merge: params.merge || false };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, importedCount: 0, merge: false, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: group_create
    server.registerTool(
      'group_create',
      {
        title: 'Group Elements',
        description: 'Group multiple elements together',
        inputSchema: {
          elementIds: z.array(z.string()).min(2)
        },
        outputSchema: {
          success: z.boolean(),
          groupId: z.string().optional(),
          elementCount: z.number(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          let count = 0;

          for (const elementId of params.elementIds) {
            const element = canvasManager.getElementById(CANVAS_ID, elementId);
            if (!element) throw new Error(`Element ${elementId} not found`);
            if (element.locked) throw new Error(`Element ${elementId} is locked`);

            const groupIds = element.groupIds || [];
            const result = await canvasManager.updateElement(CANVAS_ID, elementId, {
              groupIds: [...groupIds, groupId]
            });
            if (result.success) count++;
          }

          const output = { success: true, groupId, elementCount: count };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, elementCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: group_ungroup
    server.registerTool(
      'group_ungroup',
      {
        title: 'Ungroup Elements',
        description: 'Ungroup elements by removing a group ID',
        inputSchema: {
          groupId: z.string().min(1)
        },
        outputSchema: {
          success: z.boolean(),
          ungroupedCount: z.number(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          const allElements = canvasManager.getActiveElements(CANVAS_ID);
          const groupedElements = allElements.filter(el =>
            el.groupIds && el.groupIds.includes(params.groupId)
          );

          if (groupedElements.length === 0) {
            throw new Error(`No elements found with group ID ${params.groupId}`);
          }

          let count = 0;
          for (const element of groupedElements) {
            if (element.locked) throw new Error(`Element ${element.id} is locked`);

            const groupIds = (element.groupIds || []).filter(id => id !== params.groupId);
            const result = await canvasManager.updateElement(CANVAS_ID, element.id, { groupIds });
            if (result.success) count++;
          }

          const output = { success: true, ungroupedCount: count };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, ungroupedCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: lock_elements
    server.registerTool(
      'lock_elements',
      {
        title: 'Lock Elements',
        description: 'Lock elements to prevent modification',
        inputSchema: {
          elementIds: z.array(z.string()).min(1)
        },
        outputSchema: {
          success: z.boolean(),
          lockedCount: z.number(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          let count = 0;
          for (const elementId of params.elementIds) {
            const element = canvasManager.getElementById(CANVAS_ID, elementId);
            if (!element) throw new Error(`Element ${elementId} not found`);

            if (!element.locked) {
              const result = await canvasManager.updateElement(CANVAS_ID, elementId, { locked: true });
              if (result.success) count++;
            } else {
              count++;
            }
          }

          const output = { success: true, lockedCount: count };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, lockedCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    // Register tool: unlock_elements
    server.registerTool(
      'unlock_elements',
      {
        title: 'Unlock Elements',
        description: 'Unlock elements to allow modification',
        inputSchema: {
          elementIds: z.array(z.string()).min(1)
        },
        outputSchema: {
          success: z.boolean(),
          unlockedCount: z.number(),
          error: z.string().optional()
        }
      },
      async (params) => {
        try {
          let count = 0;
          for (const elementId of params.elementIds) {
            const element = canvasManager.getElementById(CANVAS_ID, elementId);
            if (!element) throw new Error(`Element ${elementId} not found`);

            if (element.locked) {
              const result = await canvasManager.updateElement(CANVAS_ID, elementId, { locked: false });
              if (result.success) count++;
            } else {
              count++;
            }
          }

          const output = { success: true, unlockedCount: count };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        } catch (error: any) {
          const output = { success: false, unlockedCount: 0, error: error.message };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
          };
        }
      }
    );

    logger.info('MCP tools registered', {
      tools: [
        'element_create',
        'element_update',
        'element_delete',
        'get_canvas_state',
        'batch_create_elements',
        'clear_canvas',
        'canvas_export',
        'canvas_import',
        'group_create',
        'group_ungroup',
        'lock_elements',
        'unlock_elements'
      ]
    });

    // Setup error handlers
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      process.exit(0);
    });

    // Connect server using stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('MCP server started successfully', {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: 'stdio'
    });

  } catch (error) {
    logger.error('Failed to start MCP server', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Start server
main().catch((error) => {
  logger.error('Unhandled error in main', {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error
  });
  console.error('Full unhandled error:', error);
  process.exit(1);
});
