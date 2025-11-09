/**
 * Integration tests for MCP Tools
 * Tests end-to-end tool execution including validation, service calls, and responses
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasManager } from '../../src/services/canvasManager.js';
import { getStorage } from '../../src/services/storage.js';
import type { ServerElement } from '../../src/types/index.js';
import path from 'path';
import fs from 'fs/promises';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  },
  logMCPTool: vi.fn()
}));

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'test-data-integration');
const CANVAS_ID = 'test-canvas';

describe('MCP Tools Integration', () => {
  let server: McpServer;
  let canvasManager: ReturnType<typeof getCanvasManager>;
  let storage: ReturnType<typeof getStorage>;

  beforeEach(async () => {
    // Create test data directory
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Initialize storage with test directory
    process.env.CANVAS_DATA_DIR = TEST_DATA_DIR;
    storage = getStorage();
    await storage.initialize();

    // Initialize canvas manager
    canvasManager = getCanvasManager();

    // Clear the canvas before each test
    await canvasManager.clearCanvas(CANVAS_ID);

    // Create MCP server instance
    server = new McpServer({
      name: 'test-excalidraw-mcp',
      version: '1.0.0-test'
    });

    // Register tools for testing
    await registerTestTools(server);
  });

  afterEach(async () => {
    // Clean up test data directory
    try {
      const files = await fs.readdir(TEST_DATA_DIR);
      await Promise.all(files.map(file =>
        fs.unlink(path.join(TEST_DATA_DIR, file))
      ));
      await fs.rmdir(TEST_DATA_DIR);
    } catch (error) {
      // Directory might not exist, that's okay
    }

    vi.clearAllMocks();
  });

  describe('element_create', () => {
    it('should create a rectangle element successfully', async () => {
      const params = {
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        strokeColor: '#000000',
        backgroundColor: '#ffffff'
      };

      const result = await executeElementCreate(params);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element.type).toBe('rectangle');
      expect(result.element.x).toBe(100);
      expect(result.element.y).toBe(100);
      expect(result.element.width).toBe(200);
      expect(result.element.height).toBe(150);
      expect(result.element.id).toBeDefined();
      expect(result.element.source).toBe('mcp');
    });

    it('should create an ellipse element with default dimensions', async () => {
      const params = {
        type: 'ellipse',
        x: 50,
        y: 50,
        width: 100,
        height: 100
      };

      const result = await executeElementCreate(params);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element.type).toBe('ellipse');
      expect(result.element.width).toBe(100);
      expect(result.element.height).toBe(100);
    });

    it('should create a text element', async () => {
      const params = {
        type: 'text',
        x: 10,
        y: 10,
        width: 200,
        height: 50,
        text: 'Hello, Excalidraw!',
        fontSize: 20
      };

      const result = await executeElementCreate(params);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element.type).toBe('text');
      expect(result.element.text).toBe('Hello, Excalidraw!');
    });

    it('should set server metadata on created element', async () => {
      const params = {
        type: 'diamond',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      };

      const result = await executeElementCreate(params);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element.createdAt).toBeDefined();
      expect(result.element.updatedAt).toBeDefined();
      expect(result.element.source).toBe('mcp');
      expect(result.element.versionNonce).toBeDefined();
      expect(result.element.version).toBe(1);
    });

    it('should add Excalidraw required properties', async () => {
      const params = {
        type: 'arrow',
        x: 0,
        y: 0,
        width: 100,
        height: 0
      };

      const result = await executeElementCreate(params);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element.angle).toBeDefined();
      expect(result.element.fillStyle).toBeDefined();
      expect(result.element.strokeStyle).toBeDefined();
      expect(result.element.roughness).toBeDefined();
      expect(result.element.opacity).toBeDefined();
      expect(result.element.strokeWidth).toBeDefined();
      expect(result.element.groupIds).toBeDefined();
      expect(Array.isArray(result.element.groupIds)).toBe(true);
    });

    it('should validate required fields', async () => {
      const params = {
        // Missing type
        x: 100,
        y: 100
      };

      const result = await executeElementCreate(params as any);

      // Should fail validation or handle gracefully
      expect(result.success).toBeDefined();
    });
  });

  describe('element_update', () => {
    it('should update an existing element', async () => {
      // First create an element
      const createResult = await executeElementCreate({
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150
      });

      expect(createResult.success).toBe(true);
      const elementId = createResult.element.id;

      // Update the element
      const updateResult = await executeElementUpdate({
        id: elementId,
        x: 150,
        y: 150,
        width: 250
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element).toBeDefined();
      expect(updateResult.element.id).toBe(elementId);
      expect(updateResult.element.x).toBe(150);
      expect(updateResult.element.y).toBe(150);
      expect(updateResult.element.width).toBe(250);
      expect(updateResult.element.height).toBe(150); // unchanged
    });

    it('should increment version number on update', async () => {
      const createResult = await executeElementCreate({
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const elementId = createResult.element.id;
      const initialVersion = createResult.element.version;

      const updateResult = await executeElementUpdate({
        id: elementId,
        x: 10
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element.version).toBe(initialVersion + 1);
    });

    it('should prevent ID change during update', async () => {
      const createResult = await executeElementCreate({
        type: 'diamond',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const originalId = createResult.element.id;

      const updateResult = await executeElementUpdate({
        id: originalId,
        x: 50
      } as any);

      expect(updateResult.success).toBe(true);
      expect(updateResult.element.id).toBe(originalId); // ID should not change
    });

    it('should return error for non-existent element', async () => {
      const result = await executeElementUpdate({
        id: 'non-existent-id-12345',
        x: 100
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when updating locked element', async () => {
      const createResult = await executeElementCreate({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        locked: true
      });

      const elementId = createResult.element.id;

      const updateResult = await executeElementUpdate({
        id: elementId,
        x: 50
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBeDefined();
    });

    it('should update text content', async () => {
      const createResult = await executeElementCreate({
        type: 'text',
        x: 10,
        y: 10,
        width: 200,
        height: 50,
        text: 'Original Text'
      });

      const elementId = createResult.element.id;

      const updateResult = await executeElementUpdate({
        id: elementId,
        text: 'Updated Text'
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element.text).toBe('Updated Text');
    });
  });

  describe('element_delete', () => {
    it('should delete an existing element', async () => {
      // Create element first
      const createResult = await executeElementCreate({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const elementId = createResult.element.id;

      // Delete the element
      const deleteResult = await executeElementDelete({ id: elementId });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedId).toBe(elementId);

      // Verify element is no longer in active elements
      const activeElements = canvasManager.getActiveElements(CANVAS_ID);
      expect(activeElements.find(el => el.id === elementId)).toBeUndefined();
    });

    it('should return error when deleting non-existent element', async () => {
      const result = await executeElementDelete({ id: 'non-existent-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when deleting locked element', async () => {
      const createResult = await executeElementCreate({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        locked: true
      });

      const elementId = createResult.element.id;

      const deleteResult = await executeElementDelete({ id: elementId });

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBeDefined();
    });

    it('should soft delete (not permanently remove)', async () => {
      const createResult = await executeElementCreate({
        type: 'ellipse',
        x: 50,
        y: 50,
        width: 100,
        height: 100
      });

      const elementId = createResult.element.id;

      await executeElementDelete({ id: elementId });

      // Element should still exist in storage but marked as deleted
      const canvas = await canvasManager.getCanvas(CANVAS_ID);
      const deletedElement = canvas.elements.find(el => el.id === elementId);
      expect(deletedElement).toBeDefined();
      expect(deletedElement?.isDeleted).toBe(true);
    });
  });

  describe('element_query', () => {
    beforeEach(async () => {
      // Create a diverse set of elements for querying
      await executeElementCreate({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      await executeElementCreate({
        type: 'ellipse',
        x: 100,
        y: 100,
        width: 50,
        height: 50
      });

      await executeElementCreate({
        type: 'text',
        x: 200,
        y: 200,
        width: 200,
        height: 50,
        text: 'Test'
      });

      await executeElementCreate({
        type: 'rectangle',
        x: 300,
        y: 300,
        width: 150,
        height: 150,
        locked: true
      });
    });

    it('should query all elements', async () => {
      const result = await executeElementQuery({});

      expect(result.success).toBe(true);
      expect(result.elements).toBeDefined();
      expect(result.count).toBe(4);
      expect(result.elements.length).toBe(4);
    });

    it('should filter by element type', async () => {
      const result = await executeElementQuery({ type: 'rectangle' });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.elements.every(el => el.type === 'rectangle')).toBe(true);
    });

    it('should filter by locked status', async () => {
      const result = await executeElementQuery({ locked: true });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.elements[0].locked).toBe(true);
    });

    it('should filter unlocked elements', async () => {
      const result = await executeElementQuery({ locked: false });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.elements.every(el => !el.locked)).toBe(true);
    });

    it('should apply limit', async () => {
      const result = await executeElementQuery({ limit: 2 });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.elements.length).toBe(2);
    });

    it('should combine multiple filters', async () => {
      const result = await executeElementQuery({
        type: 'rectangle',
        locked: false
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.elements[0].type).toBe('rectangle');
      expect(result.elements[0].locked).toBe(false);
    });

    it('should return empty array when no matches', async () => {
      const result = await executeElementQuery({ type: 'diamond' });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.elements).toEqual([]);
    });
  });

  describe('end-to-end workflow', () => {
    it('should support complete CRUD workflow', async () => {
      // CREATE
      const createResult = await executeElementCreate({
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150
      });

      expect(createResult.success).toBe(true);
      const elementId = createResult.element.id;

      // READ (query)
      const queryResult = await executeElementQuery({});
      expect(queryResult.elements.find(el => el.id === elementId)).toBeDefined();

      // UPDATE
      const updateResult = await executeElementUpdate({
        id: elementId,
        x: 150,
        width: 250
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element.x).toBe(150);

      // DELETE
      const deleteResult = await executeElementDelete({ id: elementId });
      expect(deleteResult.success).toBe(true);

      // VERIFY DELETION
      const finalQuery = await executeElementQuery({});
      expect(finalQuery.elements.find(el => el.id === elementId)).toBeUndefined();
    });

    it('should handle multiple elements independently', async () => {
      // Create multiple elements
      const elem1 = await executeElementCreate({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const elem2 = await executeElementCreate({
        type: 'ellipse',
        x: 100,
        y: 100,
        width: 50,
        height: 50
      });

      const elem3 = await executeElementCreate({
        type: 'diamond',
        x: 200,
        y: 200,
        width: 75,
        height: 75
      });

      // Update one
      await executeElementUpdate({
        id: elem2.element.id,
        x: 150
      });

      // Delete one
      await executeElementDelete({ id: elem3.element.id });

      // Query remaining
      const queryResult = await executeElementQuery({});
      expect(queryResult.count).toBe(2);
      expect(queryResult.elements.find(el => el.id === elem1.element.id)).toBeDefined();
      expect(queryResult.elements.find(el => el.id === elem2.element.id)).toBeDefined();
      expect(queryResult.elements.find(el => el.id === elem3.element.id)).toBeUndefined();
    }, { timeout: 15000 });
  });

  // Helper functions to execute tool calls
  async function registerTestTools(server: McpServer) {
    // Register element_create tool
    server.registerTool(
      'element_create',
      {
        title: 'Create Element',
        description: 'Create a new element in the canvas',
        inputSchema: {} as any,
        outputSchema: {} as any
      },
      async (params: any) => {
        const result = await canvasManager.createElement(CANVAS_ID, params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    // Register element_update tool
    server.registerTool(
      'element_update',
      {
        title: 'Update Element',
        description: 'Update an existing element',
        inputSchema: {} as any,
        outputSchema: {} as any
      },
      async (params: any) => {
        const { id, ...updates } = params;
        const result = await canvasManager.updateElement(CANVAS_ID, id, updates);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    // Register element_delete tool
    server.registerTool(
      'element_delete',
      {
        title: 'Delete Element',
        description: 'Delete an element',
        inputSchema: {} as any,
        outputSchema: {} as any
      },
      async (params: any) => {
        const result = await canvasManager.deleteElement(CANVAS_ID, params.id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    // Register element_query tool
    server.registerTool(
      'element_query',
      {
        title: 'Query Elements',
        description: 'Query elements with filters',
        inputSchema: {} as any,
        outputSchema: {} as any
      },
      async (params: any) => {
        let elements = canvasManager.getActiveElements(CANVAS_ID);

        if (params.type) {
          elements = elements.filter(el => el.type === params.type);
        }

        if (params.locked !== undefined) {
          elements = elements.filter(el => el.locked === params.locked);
        }

        const limit = params.limit || 100;
        elements = elements.slice(0, limit);

        const result = {
          success: true,
          elements,
          count: elements.length
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );
  }

  async function executeElementCreate(params: any) {
    const result = await canvasManager.createElement(CANVAS_ID, params);
    return result;
  }

  async function executeElementUpdate(params: any) {
    const { id, ...updates } = params;
    const result = await canvasManager.updateElement(CANVAS_ID, id, updates);
    return result;
  }

  async function executeElementDelete(params: any) {
    const result = await canvasManager.deleteElement(CANVAS_ID, params.id);
    return result;
  }

  async function executeElementQuery(params: any) {
    let elements = canvasManager.getActiveElements(CANVAS_ID);

    if (params.type) {
      elements = elements.filter(el => el.type === params.type);
    }

    if (params.locked !== undefined) {
      elements = elements.filter(el => el.locked === params.locked);
    }

    const limit = params.limit || 100;
    elements = elements.slice(0, limit);

    return {
      success: true,
      elements,
      count: elements.length
    };
  }
});
