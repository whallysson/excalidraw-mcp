import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logMCPTool } from '../../utils/logger.js';
import {
  lockElementsSchema,
  unlockElementsSchema,
  type LockElementsInput,
  type UnlockElementsInput
} from '../schemas/index.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Register all state-related MCP tools
 */
export function registerStateTools(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Tool: lock_elements
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('lock_elements'),
        arguments: lockElementsSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as LockElementsInput;

      try {
        // Validate and lock all elements
        const lockedElements = [];
        for (const elementId of args.elementIds) {
          const element = canvasManager.getElementById(CANVAS_ID, elementId);
          if (!element) {
            logMCPTool('lock_elements', args, null, { code: 'ELEMENT_NOT_FOUND' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_NOT_FOUND',
                    message: `Element ${elementId} not found`
                  }
                })
              }],
              isError: true
            };
          }

          // Only update if not already locked
          if (!element.locked) {
            const result = await canvasManager.updateElement(CANVAS_ID, elementId, {
              locked: true
            });

            if (result.success && result.element) {
              lockedElements.push(result.element);
              // Broadcast element updated
              wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
            }
          } else {
            lockedElements.push(element);
          }
        }

        logMCPTool('lock_elements', args, { lockedCount: lockedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              lockedCount: lockedElements.length,
              elementIds: lockedElements.map(el => el.id)
            })
          }]
        };
      } catch (error) {
        logMCPTool('lock_elements', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to lock elements: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: unlock_elements
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('unlock_elements'),
        arguments: unlockElementsSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as UnlockElementsInput;

      try {
        // Validate and unlock all elements
        const unlockedElements = [];
        for (const elementId of args.elementIds) {
          const element = canvasManager.getElementById(CANVAS_ID, elementId);
          if (!element) {
            logMCPTool('unlock_elements', args, null, { code: 'ELEMENT_NOT_FOUND' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_NOT_FOUND',
                    message: `Element ${elementId} not found`
                  }
                })
              }],
              isError: true
            };
          }

          // Only update if currently locked
          if (element.locked) {
            const result = await canvasManager.updateElement(CANVAS_ID, elementId, {
              locked: false
            });

            if (result.success && result.element) {
              unlockedElements.push(result.element);
              // Broadcast element updated
              wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
            }
          } else {
            unlockedElements.push(element);
          }
        }

        logMCPTool('unlock_elements', args, { unlockedCount: unlockedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              unlockedCount: unlockedElements.length,
              elementIds: unlockedElements.map(el => el.id)
            })
          }]
        };
      } catch (error) {
        logMCPTool('unlock_elements', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to unlock elements: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );
}
