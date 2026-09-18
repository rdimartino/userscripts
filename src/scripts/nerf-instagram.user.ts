// ==UserScript==
// @name         Nerf Instagram
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Keep up with friends without endless scrolling
// @author       You
// @match        https://www.instagram.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

import {
  destroyElements,
  hideElements,
  observeChanges,
  removeElements,
} from '../shared/dom';

function hideNavigation(): void {
  removeElements(['div:has(> span > div > a[href^="/reels/"])']);
}

function destroyIFrames(): void {
  destroyElements(['iframe', 'section > main + div']);
}

function hideExploreAndReels(): void {
  hideNavigation();
  destroyIFrames();

  // Only target the main Explore page.
  if (window.location.pathname === '/explore/') {
    // Thumbnails in Explore feed.
    hideElements(['main > div div:has(> div > a[href^="/p/"])']);
  }

  if (window.location.pathname === '/') {
    document
      .querySelectorAll<HTMLElement>('main article')
      .forEach((article) => {
        if (
          Array.from(article.querySelectorAll('div[role="button"]')).some(
            (button) => button.textContent === 'Follow',
          ) ||
          Array.from(article.querySelectorAll('span')).some(
            (label) =>
              label.textContent === 'Sponsored' ||
              label.textContent === 'Ad' ||
              label.textContent === 'Suggested for you',
          )
        ) {
          article.style.visibility = 'hidden';
        }
      });
  }
}

observeChanges(hideExploreAndReels);
