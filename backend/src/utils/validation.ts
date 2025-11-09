import type { ServerElement } from '../types/index.js';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/dist/types/excalidraw/element/types';

/**
 * Validates and fixes element bindings to prevent crashes from invalid boundElements
 * Based on reference implementation from mcp_excalidraw/frontend/src/App.tsx
 */
export function validateAndFixBindings(
  elements: Partial<ExcalidrawElement>[]
): Partial<ExcalidrawElement>[] {
  // Create a map of all elements by ID for quick lookup
  const elementMap = new Map(
    elements.map(el => [el.id!, el])
  );

  return elements.map(element => {
    const fixedElement = { ...element };

    // Validate boundElements array
    if (fixedElement.boundElements) {
      if (Array.isArray(fixedElement.boundElements)) {
        fixedElement.boundElements = fixedElement.boundElements.filter((binding: any) => {
          // Check binding is an object with required fields
          if (!binding || typeof binding !== 'object') {
            return false;
          }

          if (!binding.id || !binding.type) {
            return false;
          }

          // Check referenced element exists
          const referencedElement = elementMap.get(binding.id);
          if (!referencedElement) {
            return false;
          }

          // Check binding type is valid
          if (!['text', 'arrow'].includes(binding.type)) {
            return false;
          }

          return true;
        });
      } else {
        // boundElements should be an array or null
        fixedElement.boundElements = null;
      }
    }

    return fixedElement;
  });
}

/**
 * Validates element coordinates are within reasonable bounds
 */
export function validateCoordinates(x: number, y: number): boolean {
  const MAX_COORDINATE = 1000000;  // 1 million pixels
  const MIN_COORDINATE = -1000000;

  return (
    x >= MIN_COORDINATE &&
    x <= MAX_COORDINATE &&
    y >= MIN_COORDINATE &&
    y <= MAX_COORDINATE &&
    !isNaN(x) &&
    !isNaN(y) &&
    isFinite(x) &&
    isFinite(y)
  );
}

/**
 * Validates element dimensions are positive and reasonable
 */
export function validateDimensions(width: number, height: number): boolean {
  const MAX_SIZE = 100000;  // 100k pixels

  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_SIZE &&
    height <= MAX_SIZE &&
    !isNaN(width) &&
    !isNaN(height) &&
    isFinite(width) &&
    isFinite(height)
  );
}

/**
 * Validates element type is one of allowed types
 */
export function validateElementType(type: string): boolean {
  const validTypes = [
    'rectangle',
    'ellipse',
    'diamond',
    'arrow',
    'line',
    'text',
    'freedraw',
    'image',
    'frame',  // Frame container para agrupar elementos
    'embeddable',  // Elementos embutidos (iframes, etc)
    'magicframe'  // Frame especial com IA
  ];

  return validTypes.includes(type);
}

/**
 * Validates opacity is within 0-100 range
 */
export function validateOpacity(opacity: number): boolean {
  return opacity >= 0 && opacity <= 100 && !isNaN(opacity) && isFinite(opacity);
}

/**
 * Validates color string is a valid hex color
 */
export function validateColor(color: string): boolean {
  // Allow 'transparent' keyword
  if (color === 'transparent') {
    return true;
  }

  // Check hex color format: #RGB, #RRGGBB, #RRGGBBAA
  const hexRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
  return hexRegex.test(color);
}

/**
 * Validates roughness is within 0-2 range
 */
export function validateRoughness(roughness: number): boolean {
  return roughness >= 0 && roughness <= 2 && !isNaN(roughness) && isFinite(roughness);
}

/**
 * Cleans ServerElement metadata before sending to frontend
 * Removes server-specific fields (createdAt, updatedAt, source, syncedAt)
 */
export function cleanElementForExcalidraw(
  element: ServerElement
): ExcalidrawElement {
  const { createdAt, updatedAt, source, syncedAt, ...clean } = element;
  return clean as ExcalidrawElement;
}

/**
 * Gera seed aleatório para Excalidraw (usado para variação de roughness)
 */
function generateSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Adiciona propriedades obrigatórias do Excalidraw que faltam
 *
 * IMPORTANTE: Backend não pode usar convertToExcalidrawElements (função de browser)
 * Esta função replica a lógica de criação de elementos do Excalidraw para Node.js
 *
 * Campos adicionados automaticamente por tipo:
 * - Todos: seed, versionNonce, version, angle, fillStyle, strokeStyle, etc.
 * - Arrows/Lines: points array
 * - Rectangles/Diamonds: roundness
 * - Freedraw: points array (paths), pressures array
 * - Image: fileId, scale, status
 * - Frame: name (opcional), não tem roundness
 */
function ensureExcalidrawProperties(element: Partial<ExcalidrawElement>): ExcalidrawElement {
  // Propriedades obrigatórias com valores padrão
  const defaults = {
    angle: 0,
    fillStyle: 'solid' as const,
    strokeStyle: 'solid' as const,
    roughness: 1,
    opacity: 100,
    strokeWidth: 2,
    groupIds: [],
    frameId: null,
    roundness: null,  // Será definido por tipo
    seed: generateSeed(),
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false
  };

  // Roundness específico por tipo
  if (element.type === 'rectangle' || element.type === 'diamond') {
    defaults.roundness = { type: 2 } as any;
  }

  // Propriedades específicas por tipo de elemento
  let typeSpecificProps: any = {};

  // ARROWS e LINES: points obrigatório
  if (element.type === 'arrow' || element.type === 'line') {
    if (!(element as any).points) {
      const width = element.width || 0;
      const height = element.height || 0;
      typeSpecificProps.points = [[0, 0], [width, height]];
    }
  }

  // FREEDRAW: points (paths), pressures, width, height
  if (element.type === 'freedraw') {
    const points = (element as any).points || [[0, 0], [1, 1]];
    typeSpecificProps.points = points;

    // Calcular width e height a partir dos pontos se não fornecidos
    if (!element.width || !element.height) {
      const xs = points.map((p: number[]) => p[0]);
      const ys = points.map((p: number[]) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      if (!element.width) {
        typeSpecificProps.width = maxX - minX || 1;
      }
      if (!element.height) {
        typeSpecificProps.height = maxY - minY || 1;
      }
    }

    // Pressures - criar array se não fornecido
    if (!(element as any).pressures) {
      typeSpecificProps.pressures = points.map(() => 0.5);
    } else {
      typeSpecificProps.pressures = (element as any).pressures;
    }

    // Outros campos opcionais do freedraw
    typeSpecificProps.simulatePressure = (element as any).simulatePressure ?? true;
    typeSpecificProps.lastCommittedPoint = (element as any).lastCommittedPoint || points[points.length - 1];
  }

  // IMAGE: fileId, scale, status
  if (element.type === 'image') {
    typeSpecificProps.fileId = (element as any).fileId || null;
    typeSpecificProps.scale = (element as any).scale || [1, 1];
    typeSpecificProps.status = (element as any).status || 'pending';
  }

  // FRAME: name opcional, children
  if (element.type === 'frame') {
    typeSpecificProps.name = (element as any).name || null;
  }

  // Merge elemento com defaults e propriedades específicas
  const result: any = {
    ...defaults,
    ...element,
    ...typeSpecificProps,
    groupIds: element.groupIds || defaults.groupIds,
    boundElements: element.boundElements || defaults.boundElements,
    roundness: element.roundness !== undefined ? element.roundness : defaults.roundness
  };

  return result as ExcalidrawElement;
}

/**
 * Adds ServerElement metadata to ExcalidrawElement
 */
export function addServerMetadata(
  element: ExcalidrawElement | Partial<ExcalidrawElement>,
  source: 'mcp' | 'frontend' = 'mcp'
): ServerElement {
  const now = new Date().toISOString();

  // Garantir que o elemento tem todas as propriedades obrigatórias do Excalidraw
  const completeElement = ensureExcalidrawProperties(element);

  return {
    ...completeElement,
    createdAt: now,
    updatedAt: now,
    source
  };
}

/**
 * Updates ServerElement metadata timestamp
 */
export function updateServerMetadata(
  element: ServerElement,
  source: 'mcp' | 'frontend' = 'mcp'
): ServerElement {
  return {
    ...element,
    updatedAt: new Date().toISOString(),
    source
  };
}
