#!/usr/bin/env node

/**
 * Express + WebSocket Server
 * Handles HTTP endpoints and real-time WebSocket connections
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger, logWebSocket } from './utils/logger.js';
import { getWSManager } from './services/wsManager.js';
import { getCanvasManager } from './services/canvasManager.js';
import { getStorage } from './services/storage.js';
import { getHttpRateLimiter, getWSRateLimiter } from './services/rateLimiter.js';
import type { WebSocketMessage, ServerElement } from './types/index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3000', 10);

/**
 * Initialize Express server
 */
async function startServer() {
  try {
    // Initialize storage
    const storage = getStorage();
    await storage.initialize();

    // Initialize canvas manager
    const canvasManager = getCanvasManager();

    // Initialize WebSocket manager
    const wsManager = getWSManager();

    // Initialize rate limiters
    const wsLimiter = getWSRateLimiter();

    // Create Express app
    const app = express();
    app.use(express.json());

    // CORS middleware
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });

    // Rate limiting middleware (HTTP)
    const httpLimiter = getHttpRateLimiter();
    app.use((req, res, next) => {
      // Usar IP como identificador (ou X-Forwarded-For se atrás de proxy)
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

      if (!httpLimiter.checkLimit(clientIp)) {
        const usage = httpLimiter.getUsage(clientIp);
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            retryAfter: 60  // segundos
          },
          rateLimit: {
            limit: usage.limit,
            remaining: usage.remaining,
            reset: Math.ceil(Date.now() / 1000) + 60
          }
        });
        return;
      }

      next();
    });

    // Serve frontend static files
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const frontendPath = join(__dirname, 'frontend');

    app.use(express.static(frontendPath));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Get canvas state
    app.get('/api/canvas/:canvasId', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const canvas = await canvasManager.getCanvas(canvasId);
        const activeElements = canvasManager.getActiveElements(canvasId);

        res.json({
          elements: activeElements,
          appState: canvas.appState,
          metadata: {
            elementCount: activeElements.length,
            createdAt: canvas.createdAt,
            updatedAt: canvas.updatedAt,
            version: canvas.version
          }
        });
      } catch (error) {
        logger.error('Failed to get canvas state', { error });
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get canvas state'
          }
        });
      }
    });

    // Sync elements to backend
    app.post('/api/canvas/:canvasId/sync', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const { elements } = req.body as { elements: ServerElement[] };

        if (!Array.isArray(elements)) {
          res.status(400).json({
            error: {
              code: 'INVALID_INPUT',
              message: 'Elements must be an array'
            }
          });
          return;
        }

        // Update canvas with elements from frontend
        // CRITICAL: Fazer merge inteligente ao invés de substituir array completo
        const canvas = await canvasManager.getCanvas(canvasId);

        // Create map of incoming elements (includes deleted ones)
        const incomingMap = new Map(elements.map(el => [el.id, el]));

        // Merge: atualizar elementos existentes e adicionar novos
        const mergedElements = canvas.elements.map(existingEl => {
          const incoming = incomingMap.get(existingEl.id);
          if (incoming) {
            // Elemento existe no incoming, usar versão do frontend
            incomingMap.delete(existingEl.id);
            return {
              ...incoming,
              updatedAt: new Date().toISOString()
            };
          }
          // Elemento não veio do frontend, manter versão do backend
          return existingEl;
        });

        // Adicionar novos elementos que não existiam no backend
        incomingMap.forEach(newEl => {
          mergedElements.push({
            ...newEl,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        });

        canvas.elements = mergedElements;
        canvas.updatedAt = new Date().toISOString();
        canvas.version++;
        await storage.saveCanvas(canvas);

        logger.info('Sync completed', {
          canvasId,
          totalElements: mergedElements.length,
          activeElements: mergedElements.filter(el => !el.isDeleted).length,
          deletedElements: mergedElements.filter(el => el.isDeleted).length
        });

        // Broadcast to other clients (exclude source)
        wsManager.broadcastToCanvas(canvasId, {
          type: 'sync_response',
          canvasId,
          elements: mergedElements,
          timestamp: new Date().toISOString(),
          source: 'frontend'
        });

        res.json({
          success: true,
          synced: elements.length,
          active: mergedElements.filter(el => !el.isDeleted).length,
          deleted: mergedElements.filter(el => el.isDeleted).length
        });
      } catch (error) {
        logger.error('Failed to sync elements', { error });
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to sync elements'
          }
        });
      }
    });

    // Broadcast element from MCP to WebSocket clients
    app.post('/api/canvas/:canvasId/broadcast', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const { type, element, source } = req.body;

        // Validar input
        if (!type || !element) {
          res.status(400).json({
            error: {
              code: 'INVALID_INPUT',
              message: 'type and element are required'
            }
          });
          return;
        }

        // Broadcast para todos os clientes WebSocket
        wsManager.broadcastToCanvas(canvasId, {
          type,
          canvasId,
          element,
          timestamp: new Date().toISOString(),
          source: source || 'mcp'
        });

        logger.info('MCP broadcast sent to WebSocket clients', {
          canvasId,
          type,
          elementId: element.id,
          source
        });

        res.json({
          success: true,
          broadcast: true
        });
      } catch (error) {
        logger.error('Failed to broadcast from MCP', { error });
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to broadcast element'
          }
        });
      }
    });

    // MCP endpoint (for stdio MCP protocol)
    app.post('/mcp', async (req, res) => {
      try {
        const { method, params } = req.body;

        logger.info('MCP request received', { method, params });

        // Placeholder response
        res.json({
          jsonrpc: '2.0',
          id: req.body.id || 1,
          result: {
            content: [{
              type: 'text',
              text: 'MCP endpoint ready - tools registered in Phase 3'
            }]
          }
        });
      } catch (error) {
        logger.error('MCP endpoint error', { error });
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body.id || 1,
          error: {
            code: -32603,
            message: 'Internal error'
          }
        });
      }
    });

    // REST API routes for element operations
    app.post('/api/canvas/:canvasId/element/create', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const result = await canvasManager.createElement(canvasId, req.body);

        if (result.success && result.element) {
          wsManager.broadcastElementCreated(canvasId, result.element, 'http');
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    app.put('/api/canvas/:canvasId/element/:elementId/update', async (req, res) => {
      try {
        const { canvasId, elementId } = req.params;
        const result = await canvasManager.updateElement(canvasId, elementId, req.body);

        if (result.success && result.element) {
          wsManager.broadcastElementUpdated(canvasId, result.element, 'http');
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    app.delete('/api/canvas/:canvasId/element/:elementId', async (req, res) => {
      try {
        const { canvasId, elementId } = req.params;
        const result = await canvasManager.deleteElement(canvasId, elementId);

        if (result.success) {
          wsManager.broadcastElementDeleted(canvasId, elementId, 'http');
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    app.delete('/api/canvas/:canvasId/clear', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const result = await canvasManager.clearCanvas(canvasId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    app.get('/api/canvas/:canvasId/export', async (req, res) => {
      try {
        const { canvasId } = req.params;
        const format = (req.query.format as string) || 'json';
        const canvas = await canvasManager.getCanvas(canvasId);
        const activeElements = canvas.elements.filter(el => !el.isDeleted);

        const exportData = {
          type: 'excalidraw' as const,
          version: 2,
          source: 'excalidraw-mcp-server',
          elements: activeElements,
          appState: canvas.appState,
          files: {}
        };

        res.json({
          success: true,
          format,
          data: exportData,
          elementCount: activeElements.length
        });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    // Create HTTP server
    const httpServer = createServer(app);

    // Create WebSocket server
    const wss = new WebSocketServer({ server: httpServer });

    // WebSocket connection handler
    wss.on('connection', (ws: WebSocket, req) => {
      const canvasId = 'main';  // Default canvas
      const connectionId = wsManager.addConnection(ws, canvasId, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.socket.remoteAddress
      });

      logger.info('WebSocket client connected', { connectionId, canvasId });

      // Load canvas from storage if not in cache, then send initial elements
      (async () => {
        await canvasManager.getCanvas(canvasId); // Carrega do storage se necessário
        const activeElements = canvasManager.getActiveElements(canvasId);
        wsManager.sendInitialElements(connectionId, activeElements);
      })();

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          wsManager.updateLastActivity(connectionId);

          // RATE LIMITING: Verificar se cliente excedeu limite de mensagens
          if (!wsLimiter.checkLimit(connectionId)) {
            wsManager.sendToConnection(connectionId, {
              type: 'error',
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many messages, please slow down'
              },
              timestamp: new Date().toISOString()
            });
            return;
          }

          // SEGURANÇA: Remover source fornecido pelo cliente para prevenir spoofing
          // O backend sempre define o source correto baseado na origem real da mensagem
          delete (message as any).source;

          logWebSocket('message_received', connectionId, {
            type: message.type
          });

          // Handle different message types
          switch (message.type) {
            case 'sync_request':
              // Client requests full sync - load from storage if needed
              await canvasManager.getCanvas(canvasId); // Carrega do storage se necessário
              const elements = canvasManager.getActiveElements(canvasId);
              wsManager.sendInitialElements(connectionId, elements);
              break;

            case 'sync_to_backend':
              // Client sends elements to persist
              if (message.elements) {
                try {
                  // SEGURANÇA: Limpar o campo 'source' dos elementos recebidos do cliente
                  // Backend sempre define 'source' baseado na origem real da operação
                  const cleanedElements = message.elements.map((el: any) => {
                    const { source, ...elementWithoutSource } = el;
                    return {
                      ...elementWithoutSource,
                      source: 'mcp'  // Backend define source para todos os elementos
                    };
                  });

                  // Update canvas with cleaned elements
                  const canvas = await canvasManager.getCanvas(canvasId);
                  canvas.elements = cleanedElements;
                  canvas.updatedAt = new Date().toISOString();
                  canvas.version++;
                  await storage.saveCanvas(canvas);

                  logger.info('Sync from frontend', {
                    connectionId,
                    elementCount: cleanedElements.length
                  });

                  // SEGURANÇA: Backend define source='mcp' tanto na mensagem quanto nos elementos
                  // Não confia no source fornecido pelo cliente (já removido acima)
                  // Frontend só ignora source='frontend' para prevenir echo loop
                  // Send confirmation to sender
                  wsManager.sendToConnection(connectionId, {
                    type: 'sync_response',
                    canvasId,
                    elements: cleanedElements,
                    timestamp: new Date().toISOString(),
                    source: 'mcp'  // Backend define source da mensagem como mcp
                  });

                  // Broadcast to other clients (exclude sender to prevent echo loop)
                  wsManager.broadcastToCanvas(canvasId, {
                    type: 'sync_response',
                    canvasId,
                    elements: cleanedElements,
                    timestamp: new Date().toISOString(),
                    source: 'mcp'  // Backend define source da mensagem como mcp
                  }, connectionId);
                } catch (error) {
                  logger.error('Failed to sync elements', { error });

                  wsManager.sendToConnection(connectionId, {
                    type: 'error',
                    error: {
                      code: 'SYNC_ERROR',
                      message: 'Failed to sync elements'
                    },
                    timestamp: new Date().toISOString()
                  });
                }
              }
              break;

            default:
              logger.warn('Unknown message type', {
                connectionId,
                type: message.type
              });
          }
        } catch (error) {
          logger.error('Error handling WebSocket message', {
            connectionId,
            error
          });

          // Send error message
          wsManager.sendToConnection(connectionId, {
            type: 'error',
            error: {
              code: 'INVALID_MESSAGE',
              message: 'Failed to process message'
            },
            timestamp: new Date().toISOString()
          });
        }
      });

      // Handle connection close
      ws.on('close', () => {
        logger.info('WebSocket client disconnected', { connectionId });
      });

      // Handle connection errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { connectionId, error });
      });
    });

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info('Server started', {
        port: PORT,
        wsPort: WS_PORT,
        env: process.env.NODE_ENV || 'development'
      });

      console.log(`\n🚀 Excalidraw MCP Server`);
      console.log(`   HTTP: http://localhost:${PORT}`);
      console.log(`   WebSocket: ws://localhost:${WS_PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health\n`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start server
startServer().catch((error) => {
  logger.error('Unhandled error in server startup', { error });
  process.exit(1);
});
