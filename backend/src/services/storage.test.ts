import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasStorage } from './storage.js';
import type { Canvas } from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CanvasStorage', () => {
  let storage: CanvasStorage;
  const testDataDir = path.join(__dirname, '../../test-data');

  beforeEach(async () => {
    // Criar diretório de teste
    await fs.mkdir(testDataDir, { recursive: true });
    storage = new CanvasStorage(testDataDir);
    await storage.initialize();
  });

  afterEach(async () => {
    // Limpar diretório de teste
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignorar erro se diretório não existe
    }
  });

  describe('saveCanvas', () => {
    it('deve salvar canvas com sucesso', async () => {
      const canvas: Canvas = {
        id: 'test-canvas',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const loaded = await storage.loadCanvas('test-canvas');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('test-canvas');
    });

    it('deve resolver promise apenas quando save realmente acontece (teste de race condition)', async () => {
      const canvas: Canvas = {
        id: 'race-test',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      // Fazer múltiplos saves rápidos (throttling deve juntar em um)
      const promises = [];
      for (let i = 0; i < 5; i++) {
        canvas.version = i + 1;
        promises.push(storage.saveCanvas(canvas));
      }

      // Todas promises devem resolver
      await Promise.all(promises);

      // Verificar que save realmente aconteceu
      const loaded = await storage.loadCanvas('race-test');
      expect(loaded).toBeDefined();
      expect(loaded?.version).toBeGreaterThanOrEqual(1);
    });

    it('deve fazer throttling de saves frequentes', async () => {
      const canvas: Canvas = {
        id: 'throttle-test',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      const startTime = Date.now();

      // Fazer 3 saves rápidos
      await storage.saveCanvas({ ...canvas, version: 1 });
      await storage.saveCanvas({ ...canvas, version: 2 });
      await storage.saveCanvas({ ...canvas, version: 3 });

      const duration = Date.now() - startTime;

      // Deve ter levado pelo menos 1s (throttle de 1000ms)
      expect(duration).toBeGreaterThanOrEqual(1000);

      // Última versão deve estar salva
      const loaded = await storage.loadCanvas('throttle-test');
      expect(loaded?.version).toBe(3);
    });
  });

  describe('loadCanvas', () => {
    it('deve retornar null para canvas inexistente', async () => {
      const loaded = await storage.loadCanvas('non-existent');
      expect(loaded).toBeNull();
    });

    it('deve carregar canvas salvo corretamente', async () => {
      const canvas: Canvas = {
        id: 'load-test',
        elements: [
          {
            id: 'element-1',
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            isDeleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as any
        ],
        appState: { viewBackgroundColor: '#ffffff' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const loaded = await storage.loadCanvas('load-test');

      expect(loaded).toBeDefined();
      expect(loaded?.elements.length).toBe(1);
      expect(loaded?.elements[0].type).toBe('rectangle');
    });
  });

  describe('canvasExists', () => {
    it('deve retornar true para canvas existente', async () => {
      const canvas: Canvas = {
        id: 'exists-test',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      const exists = await storage.canvasExists('exists-test');
      expect(exists).toBe(true);
    });

    it('deve retornar false para canvas inexistente', async () => {
      const exists = await storage.canvasExists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('deleteCanvas', () => {
    it('deve deletar canvas existente', async () => {
      const canvas: Canvas = {
        id: 'delete-test',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas);
      await storage.deleteCanvas('delete-test');

      const exists = await storage.canvasExists('delete-test');
      expect(exists).toBe(false);
    });

    it('não deve lançar erro ao deletar canvas inexistente', async () => {
      await expect(storage.deleteCanvas('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listCanvases', () => {
    it('deve listar todos canvas salvos', async () => {
      const canvas1: Canvas = {
        id: 'list-1',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      const canvas2: Canvas = {
        id: 'list-2',
        elements: [],
        appState: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await storage.saveCanvas(canvas1);
      await storage.saveCanvas(canvas2);

      const list = await storage.listCanvases();
      expect(list).toContain('list-1');
      expect(list).toContain('list-2');
      expect(list.length).toBe(2);
    });

    it('deve retornar array vazio quando não há canvas', async () => {
      const list = await storage.listCanvases();
      expect(list).toEqual([]);
    });
  });
});
