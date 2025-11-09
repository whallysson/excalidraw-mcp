import type { Canvas, ServerElement, ErrorCode } from '../types/index.js';
import { ERROR_CODES } from '../types/index.js';
import { getStorage } from './storage.js';
import { logger } from '../utils/logger.js';
import {
  validateAndFixBindings,
  addServerMetadata,
  updateServerMetadata
} from '../utils/validation.js';
import { randomId } from '../utils/id.js';

/**
 * Canvas manager handles all canvas state operations (CRUD on elements)
 * Manages canvas state in memory with persistence to storage
 * Implementa LRU Cache para prevenir memory leak
 */
export class CanvasManager {
  private canvases: Map<string, Canvas> = new Map();
  private accessOrder: Map<string, number> = new Map();  // LRU tracking (timestamp)
  private storage = getStorage();
  private readonly MAX_ELEMENTS = 10000;  // Performance limit per canvas
  private readonly MAX_CANVASES = 100;    // LRU Cache limit (previne memory leak)

  constructor() {
    this.initialize();
  }

  /**
   * Initialize manager (não carrega todos canvas para prevenir memory leak)
   * Canvas são carregados sob demanda via getCanvas()
   */
  private async initialize(): Promise<void> {
    try {
      await this.storage.initialize();

      // LRU: Não carregar todos canvas automaticamente
      // Canvas serão carregados sob demanda quando acessados
      logger.info('Canvas manager initialized', { canvasCount: 0 });
    } catch (error) {
      logger.error('Failed to initialize canvas manager', { error });
      throw error;
    }
  }

  /**
   * Remove least recently used canvas from cache (LRU eviction)
   */
  private evictLRU(): void {
    if (this.canvases.size < this.MAX_CANVASES) {
      return;  // No need to evict
    }

    // Find canvas with oldest access time
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [canvasId, timestamp] of this.accessOrder.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestId = canvasId;
      }
    }

    if (oldestId) {
      this.canvases.delete(oldestId);
      this.accessOrder.delete(oldestId);
      logger.info('LRU eviction', {
        canvasId: oldestId,
        cacheSize: this.canvases.size,
        lastAccess: new Date(oldestTime).toISOString()
      });
    }
  }

  /**
   * Mark canvas as accessed (update LRU timestamp)
   */
  private markAccessed(canvasId: string): void {
    this.accessOrder.set(canvasId, Date.now());
  }

  /**
   * Get or create canvas by ID (com LRU cache)
   */
  async getCanvas(canvasId: string = 'main'): Promise<Canvas> {
    let canvas = this.canvases.get(canvasId);

    if (canvas) {
      // Canvas já em cache, atualizar LRU
      this.markAccessed(canvasId);
      return canvas;
    }

    // Canvas não está em cache, carregar do storage
    // Verificar se precisa fazer eviction antes
    this.evictLRU();

    // Try loading from storage
    canvas = await this.storage.loadCanvas(canvasId);

    if (!canvas) {
      // Create new canvas
      canvas = this.createNewCanvas(canvasId);
      await this.storage.saveCanvas(canvas);
    }

    // Adicionar ao cache
    this.canvases.set(canvasId, canvas);
    this.markAccessed(canvasId);

    logger.debug('Canvas loaded into cache', {
      canvasId,
      cacheSize: this.canvases.size
    });

    return canvas;
  }

  /**
   * Create a new canvas with default configuration
   */
  private createNewCanvas(canvasId: string): Canvas {
    const now = new Date().toISOString();

    return {
      id: canvasId,
      elements: [],
      appState: {
        viewBackgroundColor: '#ffffff',
        theme: 'light'
      },
      createdAt: now,
      updatedAt: now,
      version: 1
    };
  }

  /**
   * Create a new element and add to canvas
   *
   * NOTA: Backend replica manualmente a lógica do Excalidraw pois
   * convertToExcalidrawElements é função de browser (não funciona em Node.js)
   */
  async createElement(
    canvasId: string,
    elementData: Partial<ServerElement>
  ): Promise<{ success: boolean; element?: ServerElement; error?: { code: ErrorCode; message: string } }> {
    try {
      const canvas = await this.getCanvas(canvasId);

      // Check element limit
      if (canvas.elements.length >= this.MAX_ELEMENTS) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Canvas has reached maximum element limit of ${this.MAX_ELEMENTS}`
          }
        };
      }

      // Generate ID if not provided
      const id = elementData.id || randomId();

      // addServerMetadata já chama ensureExcalidrawProperties internamente
      // que adiciona todos os campos obrigatórios (seed, points, roundness, etc)
      const element = addServerMetadata({
        ...elementData,
        id,
        versionNonce: Date.now(),
        version: 1,
        isDeleted: false
      } as any, 'mcp');

      // Validate and fix bindings
      const [validatedElement] = validateAndFixBindings([element]);

      // Add to canvas
      canvas.elements.push(validatedElement as ServerElement);
      canvas.updatedAt = new Date().toISOString();

      // Persist to storage
      await this.storage.saveCanvas(canvas);

      logger.info('Element created', { canvasId, elementId: id, elementType: element.type });

      return { success: true, element: validatedElement as ServerElement };
    } catch (error) {
      logger.error('Failed to create element', { error, canvasId });
      return {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Failed to create element: ${error}`
        }
      };
    }
  }

  /**
   * Update an existing element
   */
  async updateElement(
    canvasId: string,
    elementId: string,
    updates: Partial<ServerElement>
  ): Promise<{ success: boolean; element?: ServerElement; error?: { code: ErrorCode; message: string } }> {
    try {
      const canvas = await this.getCanvas(canvasId);
      const elementIndex = canvas.elements.findIndex(el => el.id === elementId && !el.isDeleted);

      if (elementIndex === -1) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.ELEMENT_NOT_FOUND,
            message: `Element with ID '${elementId}' not found`
          }
        };
      }

      const existingElement = canvas.elements[elementIndex];

      // Check if element is locked
      if (existingElement.locked) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.ELEMENT_LOCKED,
            message: `Element '${elementId}' is locked and cannot be modified`
          }
        };
      }

      // Merge updates
      const updatedElement = updateServerMetadata({
        ...existingElement,
        ...updates,
        id: elementId,  // Prevent ID change
        versionNonce: Date.now(),
        version: (existingElement.version || 0) + 1
      }, 'mcp');

      // Validate and fix bindings
      const [validatedElement] = validateAndFixBindings([updatedElement]);

      // Replace in canvas
      canvas.elements[elementIndex] = validatedElement as ServerElement;
      canvas.updatedAt = new Date().toISOString();

      // Persist to storage
      await this.storage.saveCanvas(canvas);

      logger.info('Element updated', { canvasId, elementId });

      return { success: true, element: validatedElement as ServerElement };
    } catch (error) {
      logger.error('Failed to update element', { error, canvasId, elementId });
      return {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Failed to update element: ${error}`
        }
      };
    }
  }

  /**
   * Soft delete an element (set isDeleted = true)
   */
  async deleteElement(
    canvasId: string,
    elementId: string
  ): Promise<{ success: boolean; deletedId?: string; error?: { code: ErrorCode; message: string } }> {
    try {
      const canvas = await this.getCanvas(canvasId);
      const elementIndex = canvas.elements.findIndex(el => el.id === elementId && !el.isDeleted);

      if (elementIndex === -1) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.ELEMENT_NOT_FOUND,
            message: `Element with ID '${elementId}' not found`
          }
        };
      }

      const element = canvas.elements[elementIndex];

      // Check if element is locked
      if (element.locked) {
        return {
          success: false,
          error: {
            code: ERROR_CODES.ELEMENT_LOCKED,
            message: `Element '${elementId}' is locked and cannot be deleted`
          }
        };
      }

      // Soft delete
      element.isDeleted = true;
      element.updatedAt = new Date().toISOString();

      canvas.updatedAt = new Date().toISOString();

      // Persist to storage
      await this.storage.saveCanvas(canvas);

      logger.info('Element deleted', { canvasId, elementId });

      return { success: true, deletedId: elementId };
    } catch (error) {
      logger.error('Failed to delete element', { error, canvasId, elementId });
      return {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Failed to delete element: ${error}`
        }
      };
    }
  }

  /**
   * Get all active elements (not deleted)
   */
  getActiveElements(canvasId: string = 'main'): ServerElement[] {
    const canvas = this.canvases.get(canvasId);
    if (!canvas) {
      return [];
    }

    return canvas.elements.filter(el => !el.isDeleted);
  }

  /**
   * Get element by ID
   */
  getElementById(canvasId: string, elementId: string): ServerElement | undefined {
    const canvas = this.canvases.get(canvasId);
    if (!canvas) {
      return undefined;
    }

    return canvas.elements.find(el => el.id === elementId && !el.isDeleted);
  }

  /**
   * Clear all elements from canvas
   */
  async clearCanvas(canvasId: string): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const canvas = await this.getCanvas(canvasId);
      const activeCount = canvas.elements.filter(el => !el.isDeleted).length;

      // Soft delete all elements
      canvas.elements.forEach(el => {
        if (!el.isDeleted) {
          el.isDeleted = true;
          el.updatedAt = new Date().toISOString();
        }
      });

      canvas.updatedAt = new Date().toISOString();

      // Persist to storage
      await this.storage.saveCanvas(canvas);

      logger.info('Canvas cleared', { canvasId, deletedCount: activeCount });

      return { success: true, deletedCount: activeCount };
    } catch (error) {
      logger.error('Failed to clear canvas', { error, canvasId });
      return { success: false, deletedCount: 0 };
    }
  }
}

// Singleton instance
let managerInstance: CanvasManager | null = null;

/**
 * Get or create canvas manager instance
 */
export function getCanvasManager(): CanvasManager {
  if (!managerInstance) {
    managerInstance = new CanvasManager();
  }
  return managerInstance;
}

export default CanvasManager;
