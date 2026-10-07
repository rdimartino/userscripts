// ==UserScript==
// @name         Nerf YouTube
// @namespace    http://tampermonkey.net/
// @version      0.3.2
// @description  Open Shorts and Mix videos individually, disable standalone autoplay, and hide distracting YouTube feeds
// @author       You
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @run-at       document-start
// ==/UserScript==

import { destroyElements } from '../shared/dom';

let redirecting = false;

function standaloneDestination(value: string | URL): URL | null {
  try {
    const source = new URL(value, window.location.href);
    if (
      source.protocol !== 'https:' ||
      !['www.youtube.com', 'm.youtube.com'].includes(source.hostname)
    ) {
      return null;
    }

    if (/^\/shorts(?:\/|$)/.test(source.pathname)) {
      const videoId = source.pathname.match(/^\/shorts\/([\w-]+)\/?$/)?.[1];
      const destination = new URL(videoId ? '/watch' : '/', source.origin);
      if (videoId) {
        destination.searchParams.set('v', videoId);
        // Keep playback timestamps, but omit playlist/feed parameters.
        for (const param of ['t', 'start', 'end']) {
          const timestamp = source.searchParams.get(param);
          if (timestamp !== null)
            destination.searchParams.set(param, timestamp);
        }
        destination.hash = source.hash;
      }
      return destination;
    }

    if (source.pathname !== '/watch' || !source.searchParams.get('v')) {
      return null;
    }
    const playlist = source.searchParams.get('list');
    // YouTube's generated Mix IDs start with RD. Leave ordinary playlists alone,
    // even when their links also contain a radio parameter.
    const isMix = playlist
      ? playlist.startsWith('RD')
      : source.searchParams.get('start_radio') === '1';
    if (!isMix) return null;

    for (const param of ['list', 'index', 'start_radio', 'playnext']) {
      source.searchParams.delete(param);
    }
    return source;
  } catch {
    return null;
  }
}

function navigateToVideo(
  destination: URL,
  method: 'assign' | 'replace' = 'replace',
): void {
  if (redirecting) return;
  redirecting = true;
  // A full navigation clears YouTube's player queue; replacing only the address
  // or removing the playlist panel would leave the Mix playing internally.
  window.stop();
  document
    .querySelectorAll<HTMLMediaElement>('video, audio')
    .forEach((media) => {
      media.pause();
    });
  window.location[method](destination.href);
}

function disableStandaloneAutoplay(): void {
  const url = new URL(window.location.href);
  if (url.pathname !== '/watch' || url.searchParams.has('list')) return;

  document
    .querySelectorAll<HTMLElement>(
      'button:has(.ytp-autonav-toggle-button[aria-checked="true"]), ' +
        'button.ytm-autonav-toggle-button-container[aria-pressed="true"]',
    )
    .forEach((button) => {
      // Desktop initially renders a hidden, checked placeholder before loading
      // the real setting. Wait until the control is ready before clicking it.
      if (button.getClientRects().length > 0) button.click();
    });
}

function nerf(): void {
  const destination = standaloneDestination(window.location.href);
  if (destination) {
    navigateToVideo(destination);
    return;
  }

  disableStandaloneAutoplay();
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
  const destination = standaloneDestination(window.location.href);
  if (destination) {
    navigateToVideo(destination);
    return;
  }

  // Intercept before YouTube can navigate using its cached playlist data.
  const openStandaloneVideo = (event: MouseEvent) => {
    const link = event
      .composedPath()
      .find((target) => target instanceof HTMLAnchorElement);
    if (!link || link.hasAttribute('download')) return;
    const destination = standaloneDestination(link.href);
    if (!destination) return;

    link.href = destination.href;
    if (event.type === 'contextmenu') return;
    event.stopImmediatePropagation();
    // Let the browser handle new-tab/window gestures using the cleaned URL.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== '_self')
    ) {
      return;
    }
    event.preventDefault();
    navigateToVideo(destination, 'assign');
  };
  window.addEventListener('click', openStandaloneVideo, true);
  window.addEventListener('auxclick', openStandaloneVideo, true);
  window.addEventListener('contextmenu', openStandaloneVideo, true);

  // YouTube can change routes without loading a new document.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (
      ...args: Parameters<History[typeof method]>
    ) {
      const url = args[2];
      const destination = url == null ? null : standaloneDestination(url);
      if (
        destination &&
        url != null &&
        new URL(url, window.location.href).origin === window.location.origin
      ) {
        navigateToVideo(
          destination,
          method === 'pushState' ? 'assign' : 'replace',
        );
        return;
      }
      original.apply(this, args);
    };
  }

  window.addEventListener('popstate', nerf);
  window.addEventListener('pageshow', () => {
    // A page restored from the back/forward cache can have an old redirect guard.
    redirecting = false;
    nerf();
  });
  window.addEventListener('yt-navigate-finish', nerf);

  nerf();
  // At document-start, documentElement may not exist yet.
  new MutationObserver((mutations) => {
    // Ignore frequent progress-bar style changes; only autoplay control styles
    // matter here. Keep the existing feed cleanup responsive to DOM/class edits.
    if (
      mutations.some(
        (mutation) =>
          mutation.attributeName !== 'style' ||
          (mutation.target instanceof HTMLElement &&
            mutation.target.matches(
              'button[data-tooltip-target-id="ytp-autonav-toggle-button"], ' +
                'button.ytm-autonav-toggle-button-container',
            )),
      )
    ) {
      nerf();
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-checked', 'aria-pressed'],
  });
}

start();
