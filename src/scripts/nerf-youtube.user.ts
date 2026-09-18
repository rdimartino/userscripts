// ==UserScript==
// @name         Nerf YouTube
// @namespace    http://tampermonkey.net/
// @version      0.3.0
// @description  Block Shorts and hide distracting feed sections on desktop and mobile YouTube
// @author       You
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @run-at       document-start
// ==/UserScript==

import { destroyElements } from '../shared/dom';

let redirecting = false;

function isShortsUrl(value: string | URL): boolean {
  try {
    const url = new URL(value, window.location.href);
    return (
      ['www.youtube.com', 'm.youtube.com'].includes(url.hostname) &&
      /^\/shorts(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function leaveShorts(): void {
  if (redirecting) return;
  redirecting = true;
  window.stop();
  document
    .querySelectorAll<HTMLMediaElement>('video, audio')
    .forEach((media) => {
      media.pause();
    });
  window.location.replace('/');
}

function nerf(): void {
  if (isShortsUrl(window.location.href)) {
    leaveShorts();
    return;
  }

  destroyElements([
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-section-renderer',
    'ytd-rich-grid-group',
    'ytm-pivot-bar-item-renderer:has(> div.pivot-shorts)',
    'ytm-rich-section-renderer',
  ]);
}

function start(): void {
  if (isShortsUrl(window.location.href)) {
    leaveShorts();
    return;
  }

  // Stop Shorts link clicks before YouTube's own navigation handler runs.
  const blockShortsLink = (event: MouseEvent) => {
    const link = event
      .composedPath()
      .find((target) => target instanceof HTMLAnchorElement);
    if (!link || !isShortsUrl(link.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    leaveShorts();
  };
  window.addEventListener('click', blockShortsLink, true);
  window.addEventListener('auxclick', blockShortsLink, true);

  // YouTube can change routes without loading a new document.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (
      ...args: Parameters<History[typeof method]>
    ) {
      const url = args[2];
      if (
        url != null &&
        isShortsUrl(url) &&
        new URL(url, location.href).origin === location.origin
      ) {
        leaveShorts();
        return;
      }
      original.apply(this, args);
    };
  }

  window.addEventListener('popstate', nerf);
  window.addEventListener('pageshow', nerf);
  window.addEventListener('yt-navigate-finish', nerf);

  nerf();
  // At document-start, documentElement may not exist yet.
  new MutationObserver(nerf).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

start();
