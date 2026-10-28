/**
 * Toggle html class
 *
 * @param className
 */
export function toggleHtmlClass(className: string): { add: () => void; remove: () => void } {
  function add(): void {
    document.documentElement.classList.add(className);
  }

  function remove(): void {
    document.documentElement.classList.remove(className);
  }

  return {
    add,
    remove,
  };
}
