// ==UserScript==
// @name         Nerf Instagram
// @namespace    http://tampermonkey.net/
// @version      1.3.3
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

function hideReelsNavigation(): void {
  removeElements(['div:has(> span > div > a[href^="/reels/"])']);
}

function destroyIFrames(): void {
  destroyElements(['iframe', 'section > main + div']);
}

function hideExploreContent(): void {
  // Only target the main Explore page.
  if (window.location.pathname === '/explore/') {
    // Thumbnails in Explore feed.
    hideElements(['main > div div:has(> div > a[href^="/p/"])']);
  }
}

function hasRepostBadge(article: Element): boolean {
  // Match the repost badge beside an avatar, not the regular Repost action.
  return (
    article.querySelector(
      'span[role="link"]:has(> img) + div > svg[aria-label="Repost"]',
    ) !== null
  );
}

function hasAdLabel(article: Element): boolean {
  return Array.from(article.querySelectorAll('span')).some(
    (label) => label.textContent === 'Sponsored' || label.textContent === 'Ad',
  );
}

function hasSuggestionLabel(article: Element): boolean {
  return Array.from(article.querySelectorAll('span')).some(
    (label) => label.textContent === 'Suggested for you',
  );
}

function hasFollowButton(article: Element): boolean {
  return Array.from(article.querySelectorAll('div[role="button"]')).some(
    (button) => button.textContent === 'Follow',
  );
}

function shouldHideArticle(article: Element, pathname: string): boolean {
  return (
    hasRepostBadge(article) ||
    hasAdLabel(article) ||
    hasSuggestionLabel(article) ||
    (pathname === '/' && hasFollowButton(article))
  );
}

function hideUnwantedArticles(): void {
  const pathname = window.location.pathname;

  // The feed can remain visible while Instagram keeps a post/comments URL.
  document.querySelectorAll<HTMLElement>('main article').forEach((article) => {
    if (shouldHideArticle(article, pathname)) {
      article.style.visibility = 'hidden';
    }
  });
}

function updatePage(): void {
  hideReelsNavigation();
  destroyIFrames();
  hideExploreContent();
  hideUnwantedArticles();
}

observeChanges(updatePage);
