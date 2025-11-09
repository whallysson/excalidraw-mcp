/**
 * Element Format Conversion Utilities
 * Converts between ExcalidrawElement and ServerElement formats
 */

import type { ExcalidrawElement, ServerElement } from '../types/index';
import { validateAndFixBindings } from './validation';

/**
 * Converts ExcalidrawElement to ServerElement by adding server metadata
 *
 * @param element - Excalidraw element
 * @param source - Origin of the element ('mcp' | 'frontend')
 * @returns ServerElement with metadata
 */
export function toServerElement(
  element: ExcalidrawElement,
  source: 'mcp' | 'frontend' = 'frontend'
): ServerElement {
  const now = new Date().toISOString();

  return {
    ...element,
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
    source,
  };
}

/**
 * Converts ServerElement to ExcalidrawElement by removing server metadata
 *
 * @param element - Server element with metadata
 * @returns Clean ExcalidrawElement
 */
export function toExcalidrawElement(element: ServerElement): ExcalidrawElement {
  const { createdAt, updatedAt, syncedAt, source, ...excalidrawElement } = element;
  return excalidrawElement as ExcalidrawElement;
}

/**
 * Converts array of elements to server format with validation
 *
 * @param elements - Array of Excalidraw elements
 * @param source - Origin of elements
 * @returns Validated ServerElements
 */
export function toServerElements(
  elements: ExcalidrawElement[],
  source: 'mcp' | 'frontend' = 'frontend'
): ServerElement[] {
  // Validate and fix bindings first
  const validatedElements = validateAndFixBindings(elements) as ExcalidrawElement[];

  // Convert to server format
  return validatedElements.map((el) => toServerElement(el, source));
}

/**
 * Converts array of server elements to Excalidraw format with validation
 *
 * @param elements - Array of server elements
 * @returns Validated ExcalidrawElements
 */
export function toExcalidrawElements(elements: ServerElement[]): ExcalidrawElement[] {
  // Convert to Excalidraw format
  const excalidrawElements = elements.map(toExcalidrawElement);

  // Validate and fix bindings
  return validateAndFixBindings(excalidrawElements) as ExcalidrawElement[];
}

/**
 * Merges elements from backend with local elements
 * Backend elements take precedence on conflicts
 *
 * @param localElements - Elements from localStorage
 * @param backendElements - Elements from backend
 * @returns Merged element array
 */
export function mergeElements(
  localElements: ExcalidrawElement[],
  backendElements: ServerElement[]
): ExcalidrawElement[] {
  const backendMap = new Map(
    backendElements.map((el) => [el.id, toExcalidrawElement(el)])
  );

  // Start with backend elements
  const merged = Array.from(backendMap.values());

  // Add local elements that don't exist in backend
  localElements.forEach((localEl) => {
    if (!backendMap.has(localEl.id)) {
      merged.push(localEl);
    }
  });

  // Validate and fix bindings on merged result
  return validateAndFixBindings(merged) as ExcalidrawElement[];
}

/**
 * Updates element timestamp metadata
 *
 * @param element - Element to update
 * @returns Updated ServerElement
 */
export function updateElementTimestamp(element: ServerElement): ServerElement {
  return {
    ...element,
    updatedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };
}
