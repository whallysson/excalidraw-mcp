/**
 * Unit tests for CanvasStorage
 * Tests file operations, atomic writes, throttling, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasStorage } from '../../src/services/storage.js';
import type { Canvas } from '../../src/types/index.js';
import fs from 'fs/promises';
import path from 'path';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'test-data');

describe('CanvasStorage', () => {
  let storage: CanvasStorage;

  beforeEach(async () => {
    // Create test data directory
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    storage = new CanvasStorage(TEST_DATA_DIR);
    await storage.initialize();
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
  });

  describe('initialize', () => {
    it('should create data directory if it does not exist', async () => {
      const newDir = path.join(TEST_DATA_DIR, 'new-dir');
      const newStorage = new CanvasStorage(newDir);

      await newStorage.initialize();

      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);

      // Cleanup
      await fs.rmdir(newDir);
    });

    it('should not fail if directory already exists', async () => {
      const existingStorage = new CanvasStorage(TEST_DATA_DIR);

      await expect(existingStorage.initialize()).resolves.not.toThrow();
    });
  });

  describe('saveCanvas', () => {
    it('should save canvas to file', async () => {
      const canvas: Canvas = {
        id: 'test-canvas',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);

      const exists = await storage.canvasExists('test-canvas');
      expect(exists).toBe(true);
    });

    it('should save canvas with elements', async () => {
      const canvas: Canvas = {
        id: 'test-elements',
        elements: [
          {
            id: 'elem-1',
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            isDeleted: false
          } as any
        ],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);

      const loaded = await storage.loadCanvas('test-elements');
      expect(loaded).toBeDefined();
      expect(loaded?.elements.length).toBe(1);
      expect(loaded?.elements[0].id).toBe('elem-1');
    });

    it('should perform atomic write (temp file + rename)', async () => {
      const canvas: Canvas = {
        id: 'atomic-test',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);

      // Verify temp file doesn't exist after save
      const tempPath = path.join(TEST_DATA_DIR, 'canvas-atomic-test.json.tmp');
      await expect(fs.access(tempPath)).rejects.toThrow();

      // Verify final file exists
      const exists = await storage.canvasExists('atomic-test');
      expect(exists).toBe(true);
    });

    it('should sanitize canvas ID to prevent directory traversal', async () => {
      const maliciousId = '../../../etc/passwd';
      const canvas: Canvas = {
        id: maliciousId,
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);

      // Should save with sanitized ID
      const files = await fs.readdir(TEST_DATA_DIR);
      expect(files).toContain('canvas-etcpasswd.json'); // Slashes and dots removed
      expect(files).not.toContain('canvas-../../../etc/passwd.json');
    });

    it('should overwrite existing canvas file', async () => {
      const canvas1: Canvas = {
        id: 'overwrite-test',
        elements: [{ id: 'old', type: 'rectangle' } as any],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas1);

      const canvas2: Canvas = {
        id: 'overwrite-test',
        elements: [{ id: 'new', type: 'ellipse' } as any],
        appState: { theme: 'dark', viewBackgroundColor: '#000000' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 2
      };

      await storage.saveCanvas(canvas2);

      const loaded = await storage.loadCanvas('overwrite-test');
      expect(loaded?.elements[0].id).toBe('new');
      expect(loaded?.version).toBe(2);
    });
  });

  describe('loadCanvas', () => {
    it('should load existing canvas', async () => {
      const canvas: Canvas = {
        id: 'load-test',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const loaded = await storage.loadCanvas('load-test');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('load-test');
    });

    it('should return null for non-existent canvas', async () => {
      const loaded = await storage.loadCanvas('non-existent');
      expect(loaded).toBeNull();
    });

    it('should parse JSON correctly', async () => {
      const canvas: Canvas = {
        id: 'json-test',
        elements: [
          { id: '1', type: 'rectangle', x: 10, y: 20 } as any,
          { id: '2', type: 'ellipse', x: 30, y: 40 } as any
        ],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        version: 5
      };

      await storage.saveCanvas(canvas);
      const loaded = await storage.loadCanvas('json-test');

      expect(loaded?.elements.length).toBe(2);
      expect(loaded?.version).toBe(5);
      expect(loaded?.createdAt).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('canvasExists', () => {
    it('should return true for existing canvas', async () => {
      const canvas: Canvas = {
        id: 'exists-test',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const exists = await storage.canvasExists('exists-test');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent canvas', async () => {
      const exists = await storage.canvasExists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('deleteCanvas', () => {
    it('should delete existing canvas', async () => {
      const canvas: Canvas = {
        id: 'delete-test',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const existsBefore = await storage.canvasExists('delete-test');
      expect(existsBefore).toBe(true);

      await storage.deleteCanvas('delete-test');
      const existsAfter = await storage.canvasExists('delete-test');
      expect(existsAfter).toBe(false);
    });

    it('should not throw error when deleting non-existent canvas', async () => {
      await expect(storage.deleteCanvas('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listCanvases', () => {
    it('should list all canvas IDs', async () => {
      await storage.saveCanvas({
        id: 'canvas-1',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });

      await storage.saveCanvas({
        id: 'canvas-2',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });

      await storage.saveCanvas({
        id: 'canvas-3',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });

      const canvases = await storage.listCanvases();
      expect(canvases).toContain('canvas-1');
      expect(canvases).toContain('canvas-2');
      expect(canvases).toContain('canvas-3');
      expect(canvases.length).toBe(3);
    });

    it('should return empty array when no canvases exist', async () => {
      const canvases = await storage.listCanvases();
      expect(canvases).toEqual([]);
    });

    it('should only list canvas files (not other files)', async () => {
      // Create a canvas
      await storage.saveCanvas({
        id: 'real-canvas',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });

      // Create a non-canvas file
      await fs.writeFile(path.join(TEST_DATA_DIR, 'other-file.txt'), 'not a canvas');

      const canvases = await storage.listCanvases();
      expect(canvases).toContain('real-canvas');
      expect(canvases.length).toBe(1);
    });
  });

  describe('throttling behavior', () => {
    it('should handle multiple rapid saves (debouncing)', async () => {
      const canvas: Canvas = {
        id: 'throttle-test',
        elements: [],
        appState: { theme: 'light', viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      // Trigger multiple saves in rapid succession
      const save1 = storage.saveCanvas(canvas);
      const save2 = storage.saveCanvas({ ...canvas, version: 2 });
      const save3 = storage.saveCanvas({ ...canvas, version: 3 });

      // All saves should complete successfully
      await Promise.all([save1, save2, save3]);

      // Final version should be saved
      const loaded = await storage.loadCanvas('throttle-test');
      expect(loaded?.version).toBe(3);
    });
  });
});
