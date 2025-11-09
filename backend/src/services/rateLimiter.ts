import { logger } from '../utils/logger.js';

/**
 * Rate Limiter usando Sliding Window
 * Protege contra DoS e abuso de recursos
 */

interface RateLimitEntry {
  timestamps: number[];  // Array de timestamps das requisições
}

export interface RateLimitConfig {
  windowMs: number;      // Janela de tempo em ms (ex: 60000 = 1 minuto)
  maxRequests: number;   // Máximo de requisições na janela
  identifier: string;    // Nome para logs (ex: "HTTP", "WebSocket")
}

export class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup periódico de entradas antigas
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
  }

  /**
   * Verifica se requisição está dentro do limite
   * @param key Identificador único (ex: IP address, connectionId)
   * @returns true se permitido, false se rate limit excedido
   */
  checkLimit(key: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry) {
      // Primeira requisição deste key
      this.requests.set(key, {
        timestamps: [now]
      });
      return true;
    }

    // Remover timestamps fora da janela (sliding window)
    const windowStart = now - this.config.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    // Verificar se excedeu limite
    if (entry.timestamps.length >= this.config.maxRequests) {
      logger.warn('Rate limit exceeded', {
        identifier: this.config.identifier,
        key,
        requestCount: entry.timestamps.length,
        limit: this.config.maxRequests
      });
      return false;
    }

    // Adicionar timestamp atual
    entry.timestamps.push(now);
    return true;
  }

  /**
   * Obter informações sobre uso atual
   */
  getUsage(key: string): { count: number; limit: number; remaining: number } {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry) {
      return {
        count: 0,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests
      };
    }

    // Remover timestamps fora da janela
    const windowStart = now - this.config.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    return {
      count: entry.timestamps.length,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.timestamps.length)
    };
  }

  /**
   * Resetar contador para um key específico
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Limpar entradas antigas (garbage collection)
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedCount = 0;

    for (const [key, entry] of this.requests.entries()) {
      // Remover timestamps antigos
      entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

      // Se não há mais timestamps, remover entrada
      if (entry.timestamps.length === 0) {
        this.requests.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Rate limiter cleanup', {
        identifier: this.config.identifier,
        cleanedEntries: cleanedCount,
        remainingEntries: this.requests.size
      });
    }
  }

  /**
   * Destruir rate limiter (cleanup de recursos)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

// Rate limiters globais
let httpLimiter: RateLimiter | null = null;
let wsLimiter: RateLimiter | null = null;

/**
 * Obter rate limiter para requisições HTTP
 */
export function getHttpRateLimiter(): RateLimiter {
  if (!httpLimiter) {
    httpLimiter = new RateLimiter({
      windowMs: 60000,      // 1 minuto
      maxRequests: 100,     // 100 requisições por minuto
      identifier: 'HTTP'
    });
  }
  return httpLimiter;
}

/**
 * Obter rate limiter para mensagens WebSocket
 */
export function getWSRateLimiter(): RateLimiter {
  if (!wsLimiter) {
    wsLimiter = new RateLimiter({
      windowMs: 60000,      // 1 minuto
      maxRequests: 50,      // 50 mensagens por minuto
      identifier: 'WebSocket'
    });
  }
  return wsLimiter;
}
