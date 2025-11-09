/**
 * Unit tests for CanvasManager
 * Tests CRUD operations, LRU cache, element limits, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasManager } from '../../src/services/canvasManager.js';
import type { ServerElement } from '../../src/types/index.js';

// Mock dependencies
vi.mock('../../src/services/storage.js', () => ({
  getStorage: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    loadCanvas: vi.fn().mockResolvedValue(null),
    saveCanvas: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

describe('CanvasManager', () => {
  let canvasManager: CanvasManager;

  beforeEach(() => {
    vi.clearAllMocks();
    canvasManager = new CanvasManager();
  });

  describe('createElement', () => {
    it('should create a new rectangle element', async () => {
      const elementData: Partial<ServerElement> = {
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        strokeColor: '#000000',
        backgroundColor: '#ffffff'
      };

      const result = await canvasManager.createElement('main', elementData);

      expect(result.success).toBe(true);
      expect(result.element).toBeDefined();
      expect(result.element?.type).toBe('rectangle');
      expect(result.element?.x).toBe(100);
      expect(result.element?.y).toBe(100);
      expect(result.element?.id).toBeDefined();
      expect(result.element?.isDeleted).toBe(false);
      expect(result.element?.source).toBe('mcp');
    });

    it('should create an element with generated ID if not provided', async () => {
      const elementData: Partial<ServerElement> = {
        type: 'ellipse',
        x: 50,
        y: 50,
        width: 100,
        height: 100
      };

      const result = await canvasManager.createElement('main', elementData);

      expect(result.success).toBe(true);
      expect(result.element?.id).toBeDefined();
      expect(typeof result.element?.id).toBe('string');
      expect(result.element?.id.length).toBeGreaterThan(0);
    });

    it('should preserve provided element ID', async () => {
      const customId = 'custom-element-id-123';
      const elementData: Partial<ServerElement> = {
        id: customId,
        type: 'diamond',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      };

      const result = await canvasManager.createElement('main', elementData);

      expect(result.success).toBe(true);
      expect(result.element?.id).toBe(customId);
    });

    it('should add server metadata to created elements', async () => {
      const elementData: Partial<ServerElement> = {
        type: 'text',
        x: 10,
        y: 10,
        width: 200,
        height: 50
      };

      const result = await canvasManager.createElement('main', elementData);

      expect(result.success).toBe(true);
      expect(result.element?.createdAt).toBeDefined();
      expect(result.element?.updatedAt).toBeDefined();
      expect(result.element?.source).toBe('mcp');
      expect(result.element?.versionNonce).toBeDefined();
      expect(result.element?.version).toBe(1);
    });

    it('should add Excalidraw required properties automatically', async () => {
      const elementData: Partial<ServerElement> = {
        type: 'arrow',
        x: 0,
        y: 0,
        width: 100,
        height: 0
      };

      const result = await canvasManager.createElement('main', elementData);

      expect(result.success).toBe(true);
      expect(result.element?.angle).toBeDefined();
      expect(result.element?.fillStyle).toBeDefined();
      expect(result.element?.strokeStyle).toBeDefined();
      expect(result.element?.roughness).toBeDefined();
      expect(result.element?.opacity).toBeDefined();
      expect(result.element?.strokeWidth).toBeDefined();
      expect(result.element?.groupIds).toBeDefined();
      expect(Array.isArray(result.element?.groupIds)).toBe(true);
    });
  });

  describe('updateElement', () => {
    it('should update an existing element', async () => {
      // First create an element
      const createResult = await canvasManager.createElement('main', {
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 200,
        height: 150
      });

      expect(createResult.success).toBe(true);
      const elementId = createResult.element!.id;

      // Update the element
      const updateResult = await canvasManager.updateElement('main', elementId, {
        x: 150,
        y: 150,
        width: 250
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element?.x).toBe(150);
      expect(updateResult.element?.y).toBe(150);
      expect(updateResult.element?.width).toBe(250);
      expect(updateResult.element?.height).toBe(150); // unchanged
    });

    it('should increment version number on update', async () => {
      const createResult = await canvasManager.createElement('main', {
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const elementId = createResult.element!.id;
      const initialVersion = createResult.element!.version;

      const updateResult = await canvasManager.updateElement('main', elementId, {
        x: 10
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element?.version).toBe(initialVersion + 1);
    });

    it('should prevent ID change during update', async () => {
      const createResult = await canvasManager.createElement('main', {
        id: 'original-id',
        type: 'diamond',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const updateResult = await canvasManager.updateElement('main', 'original-id', {
        id: 'new-id' as any,  // Try to change ID
        x: 50
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.element?.id).toBe('original-id'); // ID should not change
    });

    it('should return error for non-existent element', async () => {
      const result = await canvasManager.updateElement('main', 'non-existent-id', {
        x: 100
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('ELEMENT_NOT_FOUND');
      expect(result.error?.message).toContain('not found');
    });

    it('should return error when updating locked element', async () => {
      const createResult = await canvasManager.createElement('main', {
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        locked: true
      });

      const elementId = createResult.element!.id;

      const updateResult = await canvasManager.updateElement('main', elementId, {
        x: 50
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBeDefined();
      expect(updateResult.error?.code).toBe('ELEMENT_LOCKED');
      expect(updateResult.error?.message).toContain('locked');
    });
  });

  describe('deleteElement', () => {
    it('should soft delete an element', async () => {
      const createResult = await canvasManager.createElement('main', {
        type: 'text',
        x: 0,
        y: 0,
        width: 200,
        height: 50
      });

      const elementId = createResult.element!.id;

      const deleteResult = await canvasManager.deleteElement('main', elementId);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedId).toBe(elementId);

      // Verify element is marked as deleted
      const activeElements = canvasManager.getActiveElements('main');
      expect(activeElements.find(el => el.id === elementId)).toBeUndefined();
    });

    it('should return error when deleting non-existent element', async () => {
      const result = await canvasManager.deleteElement('main', 'non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('ELEMENT_NOT_FOUND');
    });

    it('should return error when deleting locked element', async () => {
      const createResult = await canvasManager.createElement('main', {
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        locked: true
      });

      const elementId = createResult.element!.id;

      const deleteResult = await canvasManager.deleteElement('main', elementId);

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBeDefined();
      expect(deleteResult.error?.code).toBe('ELEMENT_LOCKED');
    });

    it('should not return deleted elements in active elements', async () => {
      // Create 3 elements
      await canvasManager.createElement('main', { type: 'rectangle', x: 0, y: 0, width: 100, height: 100 });
      const elem2 = await canvasManager.createElement('main', { type: 'ellipse', x: 100, y: 100, width: 50, height: 50 });
      await canvasManager.createElement('main', { type: 'diamond', x: 200, y: 200, width: 75, height: 75 });

      // Delete middle element
      await canvasManager.deleteElement('main', elem2.element!.id);

      const activeElements = canvasManager.getActiveElements('main');
      expect(activeElements.length).toBe(2);
      expect(activeElements.find(el => el.id === elem2.element!.id)).toBeUndefined();
    });
  });

  describe('getActiveElements', () => {
    it('should return empty array for non-existent canvas', () => {
      const elements = canvasManager.getActiveElements('non-existent');
      expect(elements).toEqual([]);
    });

    it('should return only active (non-deleted) elements', async () => {
      const elem1 = await canvasManager.createElement('main', { type: 'rectangle', x: 0, y: 0, width: 100, height: 100 });
      const elem2 = await canvasManager.createElement('main', { type: 'ellipse', x: 100, y: 100, width: 50, height: 50 });
      const elem3 = await canvasManager.createElement('main', { type: 'diamond', x: 200, y: 200, width: 75, height: 75 });

      // Delete elem2
      await canvasManager.deleteElement('main', elem2.element!.id);

      const activeElements = canvasManager.getActiveElements('main');
      expect(activeElements.length).toBe(2);
      expect(activeElements.map(el => el.id)).toEqual([elem1.element!.id, elem3.element!.id]);
    });
  });

  describe('getElementById', () => {
    it('should return element by ID', async () => {
      const createResult = await canvasManager.createElement('main', {
        id: 'test-element',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const element = canvasManager.getElementById('main', 'test-element');
      expect(element).toBeDefined();
      expect(element?.id).toBe('test-element');
    });

    it('should return undefined for non-existent element', () => {
      const element = canvasManager.getElementById('main', 'non-existent');
      expect(element).toBeUndefined();
    });

    it('should return undefined for deleted element', async () => {
      const createResult = await canvasManager.createElement('main', {
        id: 'to-delete',
        type: 'ellipse',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      await canvasManager.deleteElement('main', 'to-delete');

      const element = canvasManager.getElementById('main', 'to-delete');
      expect(element).toBeUndefined();
    });
  });

  describe('clearCanvas', () => {
    it('should soft delete all elements', async () => {
      // Create multiple elements
      await canvasManager.createElement('main', { type: 'rectangle', x: 0, y: 0, width: 100, height: 100 });
      await canvasManager.createElement('main', { type: 'ellipse', x: 100, y: 100, width: 50, height: 50 });
      await canvasManager.createElement('main', { type: 'diamond', x: 200, y: 200, width: 75, height: 75 });

      const result = await canvasManager.clearCanvas('main');

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);

      const activeElements = canvasManager.getActiveElements('main');
      expect(activeElements.length).toBe(0);
    });

    it('should return 0 deleted count for empty canvas', async () => {
      const result = await canvasManager.clearCanvas('new-canvas');

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('getCanvas', () => {
    it('should create new canvas if not exists', async () => {
      const canvas = await canvasManager.getCanvas('new-canvas');

      expect(canvas).toBeDefined();
      expect(canvas.id).toBe('new-canvas');
      expect(canvas.elements).toEqual([]);
      expect(canvas.version).toBe(1);
    });

    it('should return existing canvas from cache', async () => {
      // Create element to populate canvas
      await canvasManager.createElement('test-canvas', {
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const canvas1 = await canvasManager.getCanvas('test-canvas');
      const canvas2 = await canvasManager.getCanvas('test-canvas');

      expect(canvas1).toBe(canvas2); // Same object reference (from cache)
      expect(canvas1.elements.length).toBe(1);
    });
  });
});
