export const DEFAULT_DRAG_THRESHOLD = 6;

/**
 * Distinguish an intentional camera drag from the small hand movement that
 * commonly occurs during a normal atom click.
 */
export function isPointerDrag(start, current, threshold = DEFAULT_DRAG_THRESHOLD) {
  if (!start || !current) return false;
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}
