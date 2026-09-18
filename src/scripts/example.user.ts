// ==UserScript==
// @name         Example userscript
// @namespace    local.userscripts
// @version      0.1.0
// @description  A tiny example using a shared TypeScript helper.
// @match        https://example.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

import { addStyle } from '../shared/dom';

addStyle('body { border-top: 4px solid rebeccapurple; }');
