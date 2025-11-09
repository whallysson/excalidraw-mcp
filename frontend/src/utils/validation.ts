/**
 * Element Validation Utilities
 * Critical validation patterns to prevent crashes from invalid element bindings
 */

import type { ExcalidrawElement } from '../types/index';

/**
 * Removes server-specific metadata from elements before rendering
 * Excalidraw rejects elements with unknown properties
 *
 * @param element - Element with server metadata
 * @returns Clean element ready for Excalidraw
 */
export function cleanElementForExcalidraw(
  element: any
): Partial<ExcalidrawElement> {
  // Remove server-specific properties
  const {
    createdAt,
    updatedAt,
    version,
    syncedAt,
    source,
    syncTimestamp,
    ...cleanElement
  } = element;

  return cleanElement;
}

/**
 * Validates and fixes element bindings to prevent crashes
 * This pattern is critical from the reference implementation
 *
 * Validates:
 * - boundElements array contains only valid binding objects
 * - Each binding has id and type properties
 * - Referenced elements exist in the element set
 * - Binding types are 'text' or 'arrow'
 *
 * @param elements - Array of elements to validate
 * @returns Validated elements with fixed bindings
 */
export function validateAndFixBindings(
  elements: Partial<ExcalidrawElement>[]
): Partial<ExcalidrawElement>[] {
  // Create element lookup map for O(1) existence checks
  const elementMap = new Map(
    elements.map((el) => [el.id!, el])
  );

  return elements.map((element) => {
    const fixedElement = { ...element };

    // Validate and fix boundElements
    if (fixedElement.boundElements) {
      if (Array.isArray(fixedElement.boundElements)) {
        fixedElement.boundElements = fixedElement.boundElements.filter(
          (binding: any) => {
            // Ensure binding is an object
            if (!binding || typeof binding !== 'object') {
              return false;
            }

            // Ensure binding has required properties
            if (!binding.id || !binding.type) {
              return false;
            }

            // Ensure referenced element exists
            const referencedElement = elementMap.get(binding.id);
            if (!referencedElement) {
              return false;
            }

            // Ensure binding type is valid
            if (!['text', 'arrow'].includes(binding.type)) {
              return false;
            }

            return true;
          }
        );
      } else {
        // If boundElements is not an array, remove it
        delete fixedElement.boundElements;
      }
    }

    // Validate containerId references
    if (fixedElement.containerId) {
      const container = elementMap.get(fixedElement.containerId);
      if (!container) {
        // Container doesn't exist, remove reference
        delete fixedElement.containerId;
      }
    }

    return fixedElement;
  });
}

/**
 * Validates element coordinates are finite numbers
 *
 * @param element - Element to validate
 * @returns True if coordinates are valid
 */
export function validateCoordinates(element: Partial<ExcalidrawElement>): boolean {
  const hasValidX = typeof element.x === 'number' && isFinite(element.x);
  const hasValidY = typeof element.y === 'number' && isFinite(element.y);
  return hasValidX && hasValidY;
}

/**
 * Validates element dimensions are positive numbers
 *
 * @param element - Element to validate
 * @returns True if dimensions are valid
 */
export function validateDimensions(element: Partial<ExcalidrawElement>): boolean {
  const hasValidWidth =
    typeof element.width === 'number' && isFinite(element.width) && element.width >= 0;
  const hasValidHeight =
    typeof element.height === 'number' && isFinite(element.height) && element.height >= 0;
  return hasValidWidth && hasValidHeight;
}

/**
 * Validates entire element structure
 *
 * @param element - Element to validate
 * @returns True if element is valid
 */
export function validateElement(element: Partial<ExcalidrawElement>): boolean {
  // Must have required properties
  if (!element.id || !element.type) {
    return false;
  }

  // Must have valid coordinates
  if (!validateCoordinates(element)) {
    return false;
  }

  // Must have valid dimensions (for most element types)
  if (element.type !== 'freedraw' && !validateDimensions(element)) {
    return false;
  }

  return true;
}
