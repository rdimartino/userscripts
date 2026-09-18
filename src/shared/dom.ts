export function hideElements(selectors: string[]): void {
  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.visibility = 'hidden';
    });
  });
}

export function removeElements(selectors: string[]): void {
  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.display = 'none';
    });
  });
}

export function destroyElements(selectors: string[]): void {
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  });
}

/** Run immediately, then reapply when DOM children change. */
export function observeChanges(update: () => void): void {
  update();
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
