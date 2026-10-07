import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/scripts/nerf-youtube.user.ts'],
  bundle: true,
  write: false,
  format: 'iife',
});
const script = outputFiles[0].text;

function browser(href = 'https://m.youtube.com/') {
  const navigations = [];
  const historyCalls = [];
  const listeners = new Map();
  const location = {
    href,
    get origin() {
      return new URL(this.href).origin;
    },
    assign: (url) => navigations.push(['assign', url]),
    replace: (url) => navigations.push(['replace', url]),
  };
  class Anchor {
    constructor(href, target = '') {
      this.href = href;
      this.target = target;
    }
    hasAttribute() {
      return false;
    }
  }
  const window = {
    location,
    stop() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    history: Object.fromEntries(
      ['pushState', 'replaceState'].map((method) => [
        method,
        (...args) => {
          historyCalls.push([method, ...args]);
          if (args[2] != null) {
            location.href = new URL(args[2], location.href).href;
          }
        },
      ]),
    ),
  };
  runInNewContext(script, {
    window,
    document: { querySelectorAll: () => [] },
    URL,
    HTMLAnchorElement: Anchor,
    MutationObserver: class {
      observe() {}
    },
  });
  return {
    window,
    navigations,
    historyCalls,
    emit: (type) => listeners.get(type)?.(),
    click(href, { type = 'click', target = '', ...options } = {}) {
      const link = new Anchor(href, target);
      const event = {
        type,
        button: 0,
        defaultPrevented: false,
        stopped: false,
        composedPath: () => [{}, link],
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          this.stopped = true;
        },
        ...options,
      };
      listeners.get(type)?.(event);
      return { link, event };
    },
  };
}

test('direct Mix links load the same video without its queue or a redirect loop', () => {
  for (const host of ['m.youtube.com', 'www.youtube.com']) {
    for (const mix of ['RDvideo', 'RDMM', 'RDAMVMvideo']) {
      const url = `https://${host}/watch?v=video&list=${mix}&index=2&start_radio=1&playnext=1&t=42s&start=5&end=90#chapter`;
      const expected = `https://${host}/watch?v=video&t=42s&start=5&end=90#chapter`;
      assert.deepEqual(browser(url).navigations, [['replace', expected]]);
      assert.deepEqual(browser(expected).navigations, []);
    }
  }
});

test('radio entry links are cleaned even before YouTube assigns a Mix ID', () => {
  assert.deepEqual(
    browser('https://m.youtube.com/watch?v=video&start_radio=1').navigations,
    [['replace', 'https://m.youtube.com/watch?v=video']],
  );
});

test('regular playlists, Watch Later, ordinary videos, and external links are untouched', () => {
  for (const url of [
    'https://m.youtube.com/watch?v=video&list=PLcollection&index=2&start_radio=1',
    'https://m.youtube.com/watch?v=video&list=WL',
    'https://m.youtube.com/watch?v=video&list=LL',
    'https://m.youtube.com/watch?v=video&t=30',
    'https://m.youtube.com/playlist?list=RDvideo',
    'https://m.youtube.com/watch?list=RDvideo',
    'https://example.com/watch?v=video&list=RDvideo',
    'https://m.youtube.com.example.com/watch?v=video&list=RDvideo',
  ]) {
    const page = browser();
    const { link, event } = page.click(url);
    assert.equal(link.href, url);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
    assert.deepEqual(page.navigations, []);
    assert.deepEqual(browser(url).navigations, []);
  }
});

test('clicking a Mix video loads it separately while preserving the previous page in history', () => {
  const page = browser();
  const { event } = page.click('/watch?v=video&list=RDvideo&t=20');
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(page.navigations, [
    ['assign', 'https://m.youtube.com/watch?v=video&t=20'],
  ]);
});

test('new-tab and context-menu gestures use clean links without navigating the current tab', () => {
  for (const options of [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { type: 'auxclick', button: 1 },
    { target: '_blank' },
    { type: 'contextmenu', button: 2 },
  ]) {
    const page = browser();
    const { link, event } = page.click('/watch?v=video&list=RDvideo', options);
    assert.equal(link.href, 'https://m.youtube.com/watch?v=video');
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, options.type !== 'contextmenu');
    assert.deepEqual(page.navigations, []);
  }
});

test('SPA Mix navigation performs a full load instead of leaving a hidden player queue', () => {
  for (const [method, navigation] of [
    ['pushState', 'assign'],
    ['replaceState', 'replace'],
  ]) {
    const page = browser();
    page.window.history[method]({}, '', '/watch?v=video&list=RDvideo');
    assert.deepEqual(page.navigations, [
      [navigation, 'https://m.youtube.com/watch?v=video'],
    ]);
    assert.deepEqual(page.historyCalls, []);

    const playlist = browser();
    const args = [{ page: 'watch' }, '', '/watch?v=video&list=PLcollection'];
    playlist.window.history[method](...args);
    assert.deepEqual(playlist.historyCalls, [[method, ...args]]);
    assert.deepEqual(playlist.navigations, []);
  }
});

test('restored pages and back/forward navigation still leave Mixes', () => {
  for (const type of ['popstate', 'pageshow', 'yt-navigate-finish']) {
    const page = browser();
    page.window.location.href =
      'https://m.youtube.com/watch?v=video&list=RDvideo';
    page.emit(type);
    assert.deepEqual(page.navigations, [
      ['replace', 'https://m.youtube.com/watch?v=video'],
    ]);
  }
  const page = browser();
  page.click('/watch?v=first&list=RDfirst');
  page.emit('pageshow');
  page.click('/watch?v=second&list=RDsecond');
  assert.deepEqual(page.navigations, [
    ['assign', 'https://m.youtube.com/watch?v=first'],
    ['assign', 'https://m.youtube.com/watch?v=second'],
  ]);
});

test('Shorts still open in the regular player with timestamps preserved', () => {
  assert.deepEqual(
    browser('https://m.youtube.com/shorts/abc-123?t=10&list=RDvideo#chapter')
      .navigations,
    [['replace', 'https://m.youtube.com/watch?v=abc-123&t=10#chapter']],
  );
  assert.deepEqual(browser('https://m.youtube.com/shorts').navigations, [
    ['replace', 'https://m.youtube.com/'],
  ]);
});
