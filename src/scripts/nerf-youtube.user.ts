// ==UserScript==
// @name         Nerf YouTube
// @namespace    http://tampermonkey.net/
// @version      0.2.0
// @description  Hide YouTube Shorts
// @author       You
// @match        https://www.youtube.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

import { destroyElements, observeChanges } from '../shared/dom';

function nerf(): void {
  // Target Shorts shelves instead of removing entire recommendation sections/grids.
  destroyElements([
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
  ]);
}

observeChanges(nerf);
