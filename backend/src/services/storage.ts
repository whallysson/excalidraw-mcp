import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Canvas, ServerElement } from '../types/index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * File-based storage service with atomic writes for canvas state persistence
 * Implements atomic file writes using temp files + rename pattern
 */
// Interface para rastrear saves pendentes
interface PendingSave {
  canvas: Canvas;
  promises: Array<(value: void) => void>;
  rejects: Array<(error: any) => void>;
  timeoutId: NodeJS.Timeout | null;
}

export class CanvasStorage {
  private dataDir: string;
  private lastSave: Map<string, number> = new Map();
  private readonly saveThrottleMs = 1000;  // Max 1 write per second
  // Fila de saves pendentes para prevenir race conditions
  private pendingSaves: Map<string, PendingSave> = new Map();

  constructor(dataDir?: string) {
    this.dataDir = dataDir || process.env.CANVAS_DATA_DIR || path.join(__dirname, '../../data');
  }

  /**
   * Initialize storage by creating data directory if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      logger.info('Canvas storage initialized', { dataDir: this.dataDir });
    } catch (error) {
      logger.error('Failed to initialize storage', { error, dataDir: this.dataDir });
      throw error;
    }
  }

  /**
   * Get file path for a canvas
   */
  private getCanvasPath(canvasId: string): string {
    // Sanitize canvas ID to prevent directory traversal
    const sanitized = canvasId.replace(/[^a-zA-Z0-9-_]/g, '');
    return path.join(this.dataDir, `canvas-${sanitized}.json`);
  }

  /**
   * Save canvas with atomic write (temp file + rename)
   * Implements throttling/debouncing to prevent excessive writes
   * CORRIGIDO: Garante que Promise só resolve quando save realmente acontece
   */
  async saveCanvas(canvas: Canvas): Promise<void> {
    return new Promise((resolve, reject) => {
      // Obter ou criar entrada para este canvas
      let pending = this.pendingSaves.get(canvas.id);

      if (!pending) {
        pending = {
          canvas,
          promises: [],
          rejects: [],
          timeoutId: null
        };
        this.pendingSaves.set(canvas.id, pending);
      }

      // Atualizar para o canvas mais recente (último estado vence)
      pending.canvas = canvas;

      // Adicionar promise à fila
      pending.promises.push(resolve);
      pending.rejects.push(reject);

      // Cancelar timer anterior se houver (debounce)
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }

      // Calcular delay baseado no último save
      const now = Date.now();
      const lastSaveTime = this.lastSave.get(canvas.id) || 0;
      const delay = Math.max(0, this.saveThrottleMs - (now - lastSaveTime));

      if (delay > 0) {
        logger.debug('Save debounced', { canvasId: canvas.id, delayMs: delay, pendingPromises: pending.promises.length });
      }

      // Agendar save (debounce: cancela timer anterior)
      pending.timeoutId = setTimeout(async () => {
        await this.executeSave(canvas.id);
      }, delay);
    });
  }

  /**
   * Executa o save real e resolve todas as promises pendentes
   * Método privado chamado pelo timeout de saveCanvas
   */
  private async executeSave(canvasId: string): Promise<void> {
    const pending = this.pendingSaves.get(canvasId);
    if (!pending) return;

    const { canvas, promises, rejects } = pending;
    this.pendingSaves.delete(canvasId);

    const filePath = this.getCanvasPath(canvas.id);
    const tempPath = `${filePath}.tmp`;

    try {
      // Write to temp file
      const data = JSON.stringify(canvas, null, 2);
      await fs.writeFile(tempPath, data, 'utf-8');

      // Atomic rename (replaces existing file atomically)
      await fs.rename(tempPath, filePath);

      this.lastSave.set(canvas.id, Date.now());
      logger.info('Canvas saved', {
        canvasId: canvas.id,
        elementCount: canvas.elements.length,
        filePath,
        resolvedPromises: promises.length
      });

      // Resolver todas as promises pendentes
      promises.forEach(resolve => resolve());
    } catch (error) {
      logger.error('Failed to save canvas', { error, canvasId: canvas.id, filePath });

      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      // Rejeitar todas as promises pendentes
      rejects.forEach(reject => reject(error));
    }
  }

  /**
   * Load canvas from file
   */
  async loadCanvas(canvasId: string): Promise<Canvas | null> {
    const filePath = this.getCanvasPath(canvasId);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const canvas = JSON.parse(data) as Canvas;

      logger.info('Canvas loaded', {
        canvasId,
        elementCount: canvas.elements.length,
        filePath
      });

      return canvas;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - return null
        logger.debug('Canvas file not found', { canvasId, filePath });
        return null;
      }

      logger.error('Failed to load canvas', { error, canvasId, filePath });
      throw error;
    }
  }

  /**
   * Check if canvas file exists
   */
  async canvasExists(canvasId: string): Promise<boolean> {
    const filePath = this.getCanvasPath(canvasId);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete canvas file
   */
  async deleteCanvas(canvasId: string): Promise<void> {
    const filePath = this.getCanvasPath(canvasId);

    try {
      await fs.unlink(filePath);
      this.lastSave.delete(canvasId);
      logger.info('Canvas deleted', { canvasId, filePath });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - that's fine
        return;
      }

      logger.error('Failed to delete canvas', { error, canvasId, filePath });
      throw error;
    }
  }

  /**
   * List all canvas IDs
   */
  async listCanvases(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataDir);
      const canvasIds = files
        .filter(f => f.startsWith('canvas-') && f.endsWith('.json'))
        .map(f => f.replace('canvas-', '').replace('.json', ''));

      return canvasIds;
    } catch (error) {
      logger.error('Failed to list canvases', { error, dataDir: this.dataDir });
      throw error;
    }
  }
}

// Singleton instance
let storageInstance: CanvasStorage | null = null;

/**
 * Get or create storage instance
 */
export function getStorage(): CanvasStorage {
  if (!storageInstance) {
    storageInstance = new CanvasStorage();
  }
  return storageInstance;
}

export default CanvasStorage;
