import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getCanvasManager } from '../../services/canvasManager.js';
import { getWSManager } from '../../services/wsManager.js';
import { logMCPTool } from '../../utils/logger.js';
import {
  groupCreateSchema,
  groupUngroupSchema,
  type GroupCreateInput,
  type GroupUngroupInput
} from '../schemas/index.js';

const CANVAS_ID = 'main';  // Default canvas

/**
 * Generate unique group ID
 */
function generateGroupId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Register all group-related MCP tools
 */
export function registerGroupTools(server: Server): void {
  const canvasManager = getCanvasManager();
  const wsManager = getWSManager();

  // Tool: group_create
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('group_create'),
        arguments: groupCreateSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as GroupCreateInput;

      try {
        // Validate that all elements exist
        const elements = [];
        for (const elementId of args.elementIds) {
          const element = canvasManager.getElementById(CANVAS_ID, elementId);
          if (!element) {
            logMCPTool('group_create', args, null, { code: 'ELEMENT_NOT_FOUND' }, Date.now() - startTime);

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

          if (element.locked) {
            logMCPTool('group_create', args, null, { code: 'ELEMENT_LOCKED' }, Date.now() - startTime);

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: {
                    code: 'ELEMENT_LOCKED',
                    message: `Element ${elementId} is locked and cannot be grouped`
                  }
                })
              }],
              isError: true
            };
          }

          elements.push(element);
        }

        // Generate new group ID
        const groupId = generateGroupId();

        // Add group ID to all elements
        const updatedElements = [];
        for (const element of elements) {
          const groupIds = element.groupIds || [];
          const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
            groupIds: [...groupIds, groupId]
          });

          if (result.success && result.element) {
            updatedElements.push(result.element);
            // Broadcast element updated
            wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
          }
        }

        logMCPTool('group_create', args, { groupId, elementCount: updatedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              groupId,
              elementIds: args.elementIds,
              elementCount: updatedElements.length
            })
          }]
        };
      } catch (error) {
        logMCPTool('group_create', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to create group: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool: group_ungroup
  server.setRequestHandler(
    {
      method: 'tools/call',
      schema: z.object({
        name: z.literal('group_ungroup'),
        arguments: groupUngroupSchema
      })
    },
    async (request) => {
      const startTime = Date.now();
      const args = request.params.arguments as GroupUngroupInput;

      try {
        // Find all elements with this group ID
        const allElements = canvasManager.getActiveElements(CANVAS_ID);
        const groupedElements = allElements.filter(el =>
          el.groupIds && el.groupIds.includes(args.groupId)
        );

        if (groupedElements.length === 0) {
          logMCPTool('group_ungroup', args, null, { code: 'GROUP_NOT_FOUND' }, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'GROUP_NOT_FOUND',
                  message: `No elements found with group ID ${args.groupId}`
                }
              })
            }],
            isError: true
          };
        }

        // Check if any element is locked
        const lockedElement = groupedElements.find(el => el.locked);
        if (lockedElement) {
          logMCPTool('group_ungroup', args, null, { code: 'ELEMENT_LOCKED' }, Date.now() - startTime);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: 'ELEMENT_LOCKED',
                  message: `Element ${lockedElement.id} is locked and cannot be ungrouped`
                }
              })
            }],
            isError: true
          };
        }

        // Remove group ID from all elements
        const updatedElements = [];
        for (const element of groupedElements) {
          const groupIds = (element.groupIds || []).filter(id => id !== args.groupId);
          const result = await canvasManager.updateElement(CANVAS_ID, element.id, {
            groupIds
          });

          if (result.success && result.element) {
            updatedElements.push(result.element);
            // Broadcast element updated
            wsManager.broadcastElementUpdated(CANVAS_ID, result.element, 'mcp');
          }
        }

        logMCPTool('group_ungroup', args, { elementCount: updatedElements.length }, null, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              groupId: args.groupId,
              ungroupedCount: updatedElements.length,
              elementIds: updatedElements.map(el => el.id)
            })
          }]
        };
      } catch (error) {
        logMCPTool('group_ungroup', args, null, error, Date.now() - startTime);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to ungroup: ${error}`
              }
            })
          }],
          isError: true
        };
      }
    }
  );
}
