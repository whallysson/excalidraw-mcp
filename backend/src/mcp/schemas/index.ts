import { z } from 'zod';

/**
 * Zod schemas for MCP tool validation
 * All tools follow strict type validation before execution
 */

// Common field schemas
const coordinateSchema = z.number().finite();
const dimensionSchema = z.number().positive().finite();
const colorSchema = z.string().regex(/^(#[A-Fa-f0-9]{3,8}|transparent)$/);
const opacitySchema = z.number().min(0).max(100);
const roughnessSchema = z.number().min(0).max(2);

// Element type enum
const elementTypeSchema = z.enum([
  'rectangle',
  'ellipse',
  'diamond',
  'arrow',
  'line',
  'text',
  'freedraw'
]);

const fillStyleSchema = z.enum(['hachure', 'cross-hatch', 'solid']);
const strokeStyleSchema = z.enum(['solid', 'dashed', 'dotted']);
const textAlignSchema = z.enum(['left', 'center', 'right']);

// Element Create Schema
export const elementCreateSchema = z.object({
  type: elementTypeSchema,
  x: coordinateSchema,
  y: coordinateSchema,
  width: dimensionSchema.optional().default(100),
  height: dimensionSchema.optional().default(100),
  strokeColor: colorSchema.optional().default('#000000'),
  backgroundColor: colorSchema.optional().default('transparent'),
  fillStyle: fillStyleSchema.optional().default('hachure'),
  strokeWidth: z.number().positive().optional().default(1),
  strokeStyle: strokeStyleSchema.optional().default('solid'),
  roughness: roughnessSchema.optional().default(1),
  opacity: opacitySchema.optional().default(100),
  text: z.string().optional(),
  fontSize: z.number().positive().optional().default(20),
  fontFamily: z.number().optional().default(1),
  textAlign: textAlignSchema.optional().default('left'),
  locked: z.boolean().optional().default(false)
});

// Element Update Schema
export const elementUpdateSchema = z.object({
  id: z.string().min(1),
  x: coordinateSchema.optional(),
  y: coordinateSchema.optional(),
  width: dimensionSchema.optional(),
  height: dimensionSchema.optional(),
  strokeColor: colorSchema.optional(),
  backgroundColor: colorSchema.optional(),
  fillStyle: fillStyleSchema.optional(),
  strokeWidth: z.number().positive().optional(),
  strokeStyle: strokeStyleSchema.optional(),
  roughness: roughnessSchema.optional(),
  opacity: opacitySchema.optional(),
  text: z.string().optional(),
  fontSize: z.number().positive().optional(),
  fontFamily: z.number().optional(),
  textAlign: textAlignSchema.optional(),
  locked: z.boolean().optional()
});

// Element Delete Schema
export const elementDeleteSchema = z.object({
  id: z.string().min(1)
});

// Element Query Schema
export const elementQuerySchema = z.object({
  type: elementTypeSchema.optional(),
  inGroup: z.string().optional(),
  locked: z.boolean().optional(),
  limit: z.number().positive().optional().default(100)
});

// Canvas Clear Schema
export const canvasClearSchema = z.object({
  confirm: z.boolean()
});

// Canvas Export Schema
export const canvasExportSchema = z.object({
  format: z.enum(['json', 'excalidraw']).optional().default('json'),
  includeDeleted: z.boolean().optional().default(false)
});

// Canvas Import Schema
export const canvasImportSchema = z.object({
  data: z.string().min(1),
  merge: z.boolean().optional().default(false)
});

// Group Create Schema
export const groupCreateSchema = z.object({
  elementIds: z.array(z.string()).min(2)
});

// Group Ungroup Schema
export const groupUngroupSchema = z.object({
  groupId: z.string().min(1)
});

// Align Elements Schema
export const alignElementsSchema = z.object({
  elementIds: z.array(z.string()).min(2),
  alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom'])
});

// Distribute Elements Schema
export const distributeElementsSchema = z.object({
  elementIds: z.array(z.string()).min(3),
  direction: z.enum(['horizontal', 'vertical'])
});

// Lock Elements Schema
export const lockElementsSchema = z.object({
  elementIds: z.array(z.string()).min(1)
});

// Unlock Elements Schema
export const unlockElementsSchema = z.object({
  elementIds: z.array(z.string()).min(1)
});

// Export all schemas
export const schemas = {
  elementCreate: elementCreateSchema,
  elementUpdate: elementUpdateSchema,
  elementDelete: elementDeleteSchema,
  elementQuery: elementQuerySchema,
  canvasClear: canvasClearSchema,
  canvasExport: canvasExportSchema,
  canvasImport: canvasImportSchema,
  groupCreate: groupCreateSchema,
  groupUngroup: groupUngroupSchema,
  alignElements: alignElementsSchema,
  distributeElements: distributeElementsSchema,
  lockElements: lockElementsSchema,
  unlockElements: unlockElementsSchema
};

// Type exports for TypeScript
export type ElementCreateInput = z.infer<typeof elementCreateSchema>;
export type ElementUpdateInput = z.infer<typeof elementUpdateSchema>;
export type ElementDeleteInput = z.infer<typeof elementDeleteSchema>;
export type ElementQueryInput = z.infer<typeof elementQuerySchema>;
export type CanvasClearInput = z.infer<typeof canvasClearSchema>;
export type CanvasExportInput = z.infer<typeof canvasExportSchema>;
export type CanvasImportInput = z.infer<typeof canvasImportSchema>;
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type GroupUngroupInput = z.infer<typeof groupUngroupSchema>;
export type AlignElementsInput = z.infer<typeof alignElementsSchema>;
export type DistributeElementsInput = z.infer<typeof distributeElementsSchema>;
export type LockElementsInput = z.infer<typeof lockElementsSchema>;
export type UnlockElementsInput = z.infer<typeof unlockElementsSchema>;

export default schemas;
