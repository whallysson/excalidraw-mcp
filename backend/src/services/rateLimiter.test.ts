import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from './rateLimiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    // Configurar limiter com janela curta para testes rápidos
    limiter = new RateLimiter({
      windowMs: 1000,  // 1 segundo
      maxRequests: 3,  // 3 requisições por segundo
      identifier: 'test'
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('checkLimit', () => {
    it('deve permitir requisições dentro do limite', () => {
      const key = 'user-1';

      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);
    });

    it('deve bloquear requisições acima do limite', () => {
      const key = 'user-2';

      // 3 requisições permitidas
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);

      // 4ª requisição deve ser bloqueada
      expect(limiter.checkLimit(key)).toBe(false);
      expect(limiter.checkLimit(key)).toBe(false);
    });

    it('deve aplicar limites independentes para keys diferentes', () => {
      const key1 = 'user-1';
      const key2 = 'user-2';

      // user-1: 3 requisições (limite atingido)
      expect(limiter.checkLimit(key1)).toBe(true);
      expect(limiter.checkLimit(key1)).toBe(true);
      expect(limiter.checkLimit(key1)).toBe(true);
      expect(limiter.checkLimit(key1)).toBe(false);

      // user-2: ainda pode fazer requisições
      expect(limiter.checkLimit(key2)).toBe(true);
      expect(limiter.checkLimit(key2)).toBe(true);
    });

    it('deve permitir requisições após janela expirar (sliding window)', async () => {
      const key = 'user-3';

      // 3 requisições (limite atingido)
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(true);
      expect(limiter.checkLimit(key)).toBe(false);

      // Aguardar janela expirar (1s)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Deve permitir novamente
      expect(limiter.checkLimit(key)).toBe(true);
    });
  });

  describe('getUsage', () => {
    it('deve retornar uso correto', () => {
      const key = 'user-4';

      let usage = limiter.getUsage(key);
      expect(usage.count).toBe(0);
      expect(usage.remaining).toBe(3);

      limiter.checkLimit(key);
      usage = limiter.getUsage(key);
      expect(usage.count).toBe(1);
      expect(usage.remaining).toBe(2);

      limiter.checkLimit(key);
      usage = limiter.getUsage(key);
      expect(usage.count).toBe(2);
      expect(usage.remaining).toBe(1);

      limiter.checkLimit(key);
      usage = limiter.getUsage(key);
      expect(usage.count).toBe(3);
      expect(usage.remaining).toBe(0);
    });

    it('deve refletir sliding window no uso', async () => {
      const key = 'user-5';

      // 2 requisições
      limiter.checkLimit(key);
      limiter.checkLimit(key);

      let usage = limiter.getUsage(key);
      expect(usage.count).toBe(2);

      // Aguardar janela expirar
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Uso deve resetar
      usage = limiter.getUsage(key);
      expect(usage.count).toBe(0);
      expect(usage.remaining).toBe(3);
    });
  });

  describe('reset', () => {
    it('deve resetar contador para key específico', () => {
      const key = 'user-6';

      // 3 requisições (limite atingido)
      limiter.checkLimit(key);
      limiter.checkLimit(key);
      limiter.checkLimit(key);
      expect(limiter.checkLimit(key)).toBe(false);

      // Reset
      limiter.reset(key);

      // Deve permitir novamente
      expect(limiter.checkLimit(key)).toBe(true);
    });

    it('reset de um key não deve afetar outros', () => {
      const key1 = 'user-7';
      const key2 = 'user-8';

      limiter.checkLimit(key1);
      limiter.checkLimit(key1);
      limiter.checkLimit(key2);

      limiter.reset(key1);

      // key1 resetado
      let usage = limiter.getUsage(key1);
      expect(usage.count).toBe(0);

      // key2 não afetado
      usage = limiter.getUsage(key2);
      expect(usage.count).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('deve limpar entradas antigas automaticamente', async () => {
      const key = 'user-9';

      limiter.checkLimit(key);

      let usage = limiter.getUsage(key);
      expect(usage.count).toBe(1);

      // Aguardar janela expirar + tempo de cleanup
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verificar que entrada foi limpa (indiretamente pelo contador resetado)
      usage = limiter.getUsage(key);
      expect(usage.count).toBe(0);
    });
  });

  describe('concurrent requests', () => {
    it('deve lidar corretamente com requisições concorrentes', () => {
      const key = 'user-10';

      // Simular múltiplas requisições ao mesmo tempo
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(limiter.checkLimit(key));
      }

      // Apenas as 3 primeiras devem passar
      const allowed = results.filter(r => r === true);
      const blocked = results.filter(r => r === false);

      expect(allowed.length).toBe(3);
      expect(blocked.length).toBe(7);
    });
  });
});
