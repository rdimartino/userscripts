// ==UserScript==
// @name         Nerf YouTube
// @namespace    http://tampermonkey.net/
// @version      0.2.1
// @description  Hide Shorts, Playables, and other distracting YouTube feed sections
// @author       You
// @match        https://www.youtube.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

import { destroyElements, observeChanges } from '../shared/dom';

function nerf(): void {
  destroyElements([
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-section-renderer',
    'ytd-rich-grid-group',
  ]);
}

observeChanges(nerf);
