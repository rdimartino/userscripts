import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const { outputFiles } = await build({
  entryPoints: ['src/scripts/nerf-youtube.user.ts'],
  bundle: true,
  write: false,
  format: 'iife',
});
const script = outputFiles[0].text;
const openPages = [];

afterEach(() => {
  for (const dom of openPages.splice(0)) dom.window.close();
});

function browser(
  href = 'https://m.youtube.com/',
  html = '',
  prepare = () => {},
) {
  const dom = new JSDOM(html, { url: href });
  openPages.push(dom);
  const { document, HTMLAnchorElement, HTMLElement, MutationObserver } =
    dom.window;
  prepare(document);
  const navigations = [];
  const historyCalls = [];
  const listeners = new Map();
  const location = {
    get href() {
      return dom.window.location.href;
    },
    set href(value) {
      dom.reconfigure({ url: value });
    },
    get origin() {
      return new URL(this.href).origin;
    },
    assign: (url) => navigations.push(['assign', url]),
    replace: (url) => navigations.push(['replace', url]),
  };
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
    document,
    URL,
    HTMLAnchorElement,
    HTMLElement,
    MutationObserver,
  });
  return {
    window,
    document,
    navigations,
    historyCalls,
    settle: () => new Promise(setImmediate),
    emit: (type) => listeners.get(type)?.(),
    click(href, { type = 'click', target = '', ...options } = {}) {
      const link =
        href instanceof HTMLAnchorElement ? href : document.createElement('a');
      if (typeof href === 'string') {
        link.href = href;
        link.target = target;
      }
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

test('cleaned links still force a full load when clicked again in the current tab', () => {
  for (const href of ['/watch?v=video&list=RDvideo', '/shorts/video']) {
    for (const gesture of [
      { type: 'contextmenu', button: 2 },
      { type: 'auxclick', button: 1 },
      { ctrlKey: true },
      { metaKey: true },
    ]) {
      const page = browser();
      const { link } = page.click(href, gesture);
      assert.deepEqual(page.navigations, []);

      const { event } = page.click(link);
      assert.equal(event.defaultPrevented, true);
      assert.equal(event.stopped, true);
      assert.deepEqual(page.navigations, [
        ['assign', 'https://m.youtube.com/watch?v=video'],
      ]);
    }
  }
});

test('recycled anchors use their new URL instead of a remembered destination', () => {
  for (const href of [
    'https://m.youtube.com/watch?v=other',
    'https://m.youtube.com/watch?v=other&list=PLcollection',
    'https://example.com/',
  ]) {
    const page = browser();
    const { link } = page.click('/watch?v=video&list=RDvideo', {
      type: 'contextmenu',
    });
    link.href = href;
    const { event } = page.click(link);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
    assert.equal(link.href, href);
    assert.deepEqual(page.navigations, []);
  }

  const page = browser();
  const { link } = page.click('/watch?v=video&list=RDvideo', {
    type: 'contextmenu',
  });
  link.href = '/watch?v=other&list=RDother';
  page.click(link);
  assert.deepEqual(page.navigations, [
    ['assign', 'https://m.youtube.com/watch?v=other'],
  ]);
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

const autoplayControls = [
  {
    name: 'desktop',
    href: 'https://www.youtube.com/watch?v=video',
    html: `<button id="autoplay" data-tooltip-target-id="ytp-autonav-toggle-button">
      <span id="state" class="ytp-autonav-toggle-button" aria-checked="true"></span>
    </button>`,
    stateSelector: '#state',
    attribute: 'aria-checked',
  },
  {
    name: 'mobile',
    href: 'https://m.youtube.com/watch?v=video',
    html: `<button id="autoplay" class="ytm-autonav-toggle-button-container" aria-pressed="true"></button>`,
    stateSelector: '#autoplay',
    attribute: 'aria-pressed',
  },
];

function wireAutoplayControl(
  root,
  control,
  { visible = true, enabled = true } = {},
) {
  const button = root.querySelector('#autoplay');
  const state = root.querySelector(control.stateSelector);
  let clicks = 0;
  state.setAttribute(control.attribute, String(enabled));
  button.style.display = visible ? '' : 'none';
  // jsdom has no layout engine; supply only the visibility measurement.
  button.getClientRects = () => (button.style.display === 'none' ? [] : [{}]);
  button.addEventListener('click', () => {
    clicks++;
    state.setAttribute(
      control.attribute,
      String(state.getAttribute(control.attribute) !== 'true'),
    );
  });
  return { button, state, clicks: () => clicks };
}

for (const control of autoplayControls) {
  test(`${control.name}: standalone autoplay is disabled only when enabled and visible`, async () => {
    for (const enabled of [true, false]) {
      let player;
      const page = browser(control.href, control.html, (document) => {
        player = wireAutoplayControl(document, control, { enabled });
      });
      await page.settle();
      assert.equal(player.clicks(), enabled ? 1 : 0);
      assert.equal(player.state.getAttribute(control.attribute), 'false');
    }

    let player;
    const page = browser(control.href, control.html, (document) => {
      player = wireAutoplayControl(document, control, { visible: false });
    });
    await page.settle();
    assert.equal(player.clicks(), 0);
    player.button.style.display = '';
    await page.settle();
    assert.equal(player.clicks(), 1);
    assert.equal(player.state.getAttribute(control.attribute), 'false');
  });

  test(`${control.name}: autoplay controls added after startup are disabled`, async () => {
    const page = browser(control.href);
    const container = page.document.createElement('div');
    container.innerHTML = control.html;
    const player = wireAutoplayControl(container, control);
    page.document.body.append(container);
    await page.settle();
    assert.equal(player.clicks(), 1);
    assert.equal(player.state.getAttribute(control.attribute), 'false');
  });

  test(`${control.name}: re-enabled autoplay is disabled without rescanning feeds`, async (t) => {
    let player;
    const page = browser(control.href, control.html, (document) => {
      player = wireAutoplayControl(document, control);
    });
    await page.settle();
    const queries = t.mock.method(page.document, 'querySelectorAll');
    player.state.setAttribute(control.attribute, 'true');
    await page.settle();
    assert.equal(player.clicks(), 2);
    assert.equal(player.state.getAttribute(control.attribute), 'false');
    // Allow an autoplay query for re-enabling and another for the click's update.
    assert.ok(
      queries.mock.callCount() <= 2,
      'autoplay changes must not scan feeds',
    );
  });

  test(`${control.name}: autoplay is untouched in regular playlists and outside watch pages`, async () => {
    for (const href of [
      ...['PLcollection', 'WL', 'LL'].map(
        (list) => `${control.href}&list=${list}`,
      ),
      new URL('/', control.href).href,
    ]) {
      let player;
      const page = browser(href, control.html, (document) => {
        player = wireAutoplayControl(document, control);
      });
      player.state.setAttribute(control.attribute, 'true');
      await page.settle();
      assert.equal(player.clicks(), 0);
      assert.equal(player.state.getAttribute(control.attribute), 'true');
    }
  });

  test(`${control.name}: route changes apply the current page's autoplay policy`, async () => {
    let player;
    const page = browser(
      `${control.href}&list=PLcollection`,
      control.html,
      (document) => {
        player = wireAutoplayControl(document, control);
      },
    );
    page.window.history.pushState({}, '', control.href);
    page.emit('yt-navigate-finish');
    await page.settle();
    assert.equal(player.clicks(), 1);

    page.window.history.pushState({}, '', `${control.href}&list=PLcollection`);
    page.emit('yt-navigate-finish');
    player.state.setAttribute(control.attribute, 'true');
    await page.settle();
    assert.equal(player.clicks(), 1);
    assert.equal(player.state.getAttribute(control.attribute), 'true');
  });
}

test('unrelated progress styles do not trigger document scans', async (t) => {
  const page = browser(
    'https://www.youtube.com/watch?v=video',
    '<div id="progress"></div>',
  );
  await page.settle();
  const progress = page.document.querySelector('#progress');
  const queries = t.mock.method(page.document, 'querySelectorAll');
  progress.style.width = '50%';
  await page.settle();
  assert.equal(queries.mock.callCount(), 0);
});

test('distracting feeds are removed at startup and when added later', async () => {
  const feeds = `
    <ytd-reel-shelf-renderer data-distraction></ytd-reel-shelf-renderer>
    <ytd-rich-shelf-renderer is-shorts data-distraction></ytd-rich-shelf-renderer>
    <ytd-rich-section-renderer data-distraction></ytd-rich-section-renderer>
    <ytd-rich-grid-group data-distraction></ytd-rich-grid-group>
    <ytm-pivot-bar-item-renderer data-distraction><div class="pivot-shorts"></div></ytm-pivot-bar-item-renderer>
    <ytm-rich-section-renderer data-distraction></ytm-rich-section-renderer>
    <ytd-video-renderer data-keep></ytd-video-renderer>
    <ytd-rich-shelf-renderer data-keep></ytd-rich-shelf-renderer>
    <ytm-pivot-bar-item-renderer data-keep><div class="pivot-subscriptions"></div></ytm-pivot-bar-item-renderer>`;
  for (const initial of [true, false]) {
    const page = browser('https://m.youtube.com/', initial ? feeds : '');
    if (!initial) page.document.body.innerHTML = feeds;
    await page.settle();
    assert.equal(
      page.document.querySelectorAll('[data-distraction]').length,
      0,
    );
    assert.equal(page.document.querySelectorAll('[data-keep]').length, 3);
  }
});

test('feeds that become Shorts through attribute changes are removed', async () => {
  const page = browser(
    'https://m.youtube.com/',
    `
    <ytm-pivot-bar-item-renderer><div id="pivot"></div></ytm-pivot-bar-item-renderer>
    <ytd-rich-shelf-renderer></ytd-rich-shelf-renderer>`,
  );
  page.document.querySelector('#pivot').className = 'pivot-shorts';
  await page.settle();
  assert.equal(
    page.document.querySelector('ytm-pivot-bar-item-renderer'),
    null,
  );

  page.document
    .querySelector('ytd-rich-shelf-renderer')
    .setAttribute('is-shorts', '');
  await page.settle();
  assert.equal(page.document.querySelector('ytd-rich-shelf-renderer'), null);
});
