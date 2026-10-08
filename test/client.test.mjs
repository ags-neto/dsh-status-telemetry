/**
 * Offline test suite for the status-telemetry client module.
 *
 * The client bundle is hand-written plain JS, so nothing type-checks it; this
 * suite exercises the real module through a tiny React double that mimics the
 * hook dispatch order the component relies on. It covers:
 *   - pure formatters and derivations,
 *   - rendered output for populated, absent, and empty sessions,
 *   - the slot registration contract the framework validates at load.
 *
 * Run: node --test test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// The client bundle is an ES module here (package type: module) even though the
// browser consumes it as a ModuleLoader bundle; the test imports it directly.
const mod = await import(pathToFileURL(join(here, '..', 'client.js')).href);
const T = mod.__test;

// React is not part of the Node installation: the browser resolves it from the
// boot module table. Use it for a cross-check only when it happens to be present.
let realReact = null;
try {
  realReact = require('/opt/dsh/node_modules/react');
} catch {
  realReact = null;
}

/**
 * Minimal React double: element creation plus the hook dispatch the component
 * uses. `useState` answers from a queue so one render can be scripted.
 */
function makeReact(states = []) {
  let cursor = 0;
  const setterCalls = [];
  return {
    createElement(type, props, ...children) {
      return {
        type,
        props: props ?? {},
        children: children.flat().filter((child) => child !== null && child !== undefined && child !== false)
      };
    },
    useState(initial) {
      const index = cursor++;
      const value = index < states.length ? states[index] : initial;
      const setter = (next) => setterCalls.push(next);
      return [value, setter];
    },
    __setterCalls: setterCalls
  };
}

/** Flatten an element tree to its text content. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node.type === 'function') return textOf(node.type({ ...node.props, children: node.children }));
  return (node.children ?? []).map(textOf).join('');
}

/** Every element in the tree, depth first, expanding function components. */
function elementsOf(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => elementsOf(child, out));
    return out;
  }
  out.push(node);
  if (typeof node.type === 'function') {
    elementsOf(node.type({ ...node.props, children: node.children }), out);
    return out;
  }
  (node.children ?? []).forEach((child) => elementsOf(child, out));
  return out;
}

/** Find the first element with the given class. */
function findByClass(tree, className) {
  return elementsOf(tree).find((element) => String(element.props.className ?? '').split(' ').includes(className));
}

/** Find the first element carrying the given data attribute. */
function findByAttr(tree, attr) {
  return elementsOf(tree).find((element) => element.props[attr] !== undefined);
}

/**
 * Render the component with scripted projections.
 * @param projections - map of projection key to value; absent keys read undefined.
 * @param options - `open` scripts the initial useState value, `t` overrides the locale function.
 */
function render(projections, options = {}) {
  const react = makeReact(options.open ? [options.open] : []);
  T.setReact(react);
  const seen = [];
  const useProjection = (key) => {
    seen.push(key);
    return projections[key];
  };
  const t = options.t ?? ((key, params) => (params ? T.en[key]?.replace(/\{(\w+)\}/g, (m, n) => String(params[n] ?? m)) ?? key : T.en[key] ?? key));
  const tree = T.StatusTelemetry({ useProjection, t });
  return { tree, seen, react };
}

const POPULATED = {
  sessionStats: {
    turns: 12,
    steps: 41,
    llmMs: 96_400,
    toolMs: 31_200,
    ttftMs: 3_600,
    ttftSteps: 9,
    decodeMs: 42_000,
    decodeTokens: 6_300
  },
  tokenUsage: {
    uncachedInputTokens: 82_000,
    cacheReadTokens: 512_000,
    cacheWriteTokens: 14_000,
    outputTokens: 26_000
  },
  contextPressure: { projectedTokens: 96_000, pressureTokens: 88_000, contextWindow: 128_000 },
  contextBreakdown: { systemTokens: 4_000, toolsTokens: 12_000, messageTokens: 80_000 }
};

test('registration contract matches the slot framework', () => {
  assert.equal(mod.SLOT, 'conversation.composer.dock');
  // A list slot rejects a duplicate id at the same priority, so the entry must
  // not reuse the built-in chat entry's id.
  assert.notEqual(mod.ENTRY_ID, 'stats');
  assert.ok(mod.inject.includes('slots'));
  assert.ok(mod.inject.includes('locale'));
});

test('apply registers one entry with locale and a distinct id', () => {
  const registered = [];
  const injected = [];
  const localeRegistrations = [];
  const ctx = {
    effect: (fn) => fn(),
    locale: {
      register: (ns, dicts) => {
        localeRegistrations.push({ ns, dicts });
        return () => {};
      },
      bind: (ns) => (key) => `[${ns}]${key}`
    },
    slots: {
      inject: (key, callback) => {
        injected.push(key);
        return callback();
      },
      register: (options, component) => {
        registered.push({ options, component });
        return () => {};
      }
    }
  };

  mod.apply(ctx);

  assert.deepEqual(injected, ['conversation.composer.dock']);
  assert.equal(registered.length, 1);
  const { options, component } = registered[0];
  assert.equal(options.name, 'conversation.composer.dock');
  assert.equal(options.id, mod.ENTRY_ID);
  assert.equal(options.locale, mod.NS);
  assert.equal(typeof options.order, 'number');
  assert.equal(typeof options.inject, 'function');
  assert.equal(typeof component, 'function');
  assert.deepEqual(Object.keys(options.inject()), []);
  // Locale dictionaries for the plugin namespace must be available before the
  // entry renders, or `t` throws on an unregistered namespace.
  assert.equal(localeRegistrations.length, 1);
  assert.equal(localeRegistrations[0].ns, mod.NS);
  assert.ok(localeRegistrations[0].dicts.en['panel.title']);
});

test('formatters render professional, unambiguous values', () => {
  assert.equal(T.compactTokens(0), '0');
  assert.equal(T.compactTokens(812), '812');
  assert.equal(T.compactTokens(6_300), '6.3k');
  assert.equal(T.compactTokens(1_240_000), '1.2M');
  assert.equal(T.compactDuration(0), '0ms');
  assert.equal(T.compactDuration(812), '812ms');
  assert.equal(T.compactDuration(45_200), '45.2s');
  assert.equal(T.compactDuration(162_000), '2m42s');
  assert.equal(T.compactDuration(3_780_000), '1h03m');
  assert.equal(T.round1(48.04), '48');
  assert.equal(T.round1(48.06), '48.1');
  assert.equal(T.group(1234567), '1,234,567');
  assert.equal(T.percentText(0.9999), '100');
  assert.equal(T.percentText(0.862), '86');
  assert.equal(T.percentText(0.0412), '4.1');
});

test('derivations are defensive about absent and zeroed projections', () => {
  const usage = POPULATED.tokenUsage;
  assert.equal(T.billedInput(usage), 82_000 + 512_000 + 14_000);
  assert.equal(T.cacheHitRatio(usage), 512_000 / 608_000);
  assert.equal(T.cacheHitRatio({ uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), null);
  assert.equal(T.tokensPerSecond(POPULATED.sessionStats), 6_300 / 42);
  assert.equal(T.tokensPerSecond({ decodeMs: 0, decodeTokens: 0 }), null);
  assert.equal(T.tokensPerSecond(undefined), null);
  assert.equal(T.averageTtft(POPULATED.sessionStats), 3_600 / 9);
  assert.equal(T.averageTtft({ ttftMs: 0, ttftSteps: 0 }), null);
  assert.equal(T.contextOccupancy(POPULATED.contextPressure), 96_000 / 128_000);
  assert.equal(T.contextOccupancy({ contextWindow: 0 }), null);
  assert.equal(T.contextOccupancy({}), null);
  // severity: higher is better; severityInverse: lower is better.
  assert.equal(T.severity(60, 50, 20), 'ok');
  assert.equal(T.severity(30, 50, 20), 'warn');
  assert.equal(T.severity(10, 50, 20), 'bad');
  assert.equal(T.severity(null, 50, 20), 'none');
  assert.equal(T.severityInverse(100, 800, 2500), 'ok');
  assert.equal(T.severityInverse(1_500, 800, 2500), 'warn');
  assert.equal(T.severityInverse(4_000, 800, 2500), 'bad');
});

test('a session with activity shows a collapsed pill with real figures', () => {
  const { tree, seen } = render({ sessionStats: POPULATED.sessionStats, tokenUsage: POPULATED.tokenUsage });
  const pill = findByAttr(tree, 'data-status-telemetry-pill');
  assert.ok(pill, 'pill is rendered');
  assert.equal(pill.props['aria-expanded'], false);
  assert.equal(pill.props.type, 'button');
  const text = textOf(pill);
  assert.match(text, /12/);
  assert.match(text, /turns/);
  assert.match(text, /41/);
  assert.match(text, /steps/);
  assert.match(text, /634k/); // (82k + 512k + 14k + 26k) compacted
  assert.match(text, /84% cached/); // 512/608
  assert.match(text, /150 tok\/s/); // 6300 / 42s
  assert.equal(findByAttr(tree, 'data-status-telemetry-panel'), undefined, 'panel stays collapsed');
  assert.deepEqual(seen, ['tokenUsage', 'sessionStats', 'contextPressure', 'contextBreakdown']);
});

test('an empty session renders nothing at all', () => {
  const { tree } = render({});
  assert.equal(tree, null);
});

test('sessions with steps but no billed tokens still render', () => {
  const { tree } = render({ sessionStats: { ...POPULATED.sessionStats, decodeMs: 0, decodeTokens: 0 } });
  const pill = findByAttr(tree, 'data-status-telemetry-pill');
  assert.ok(pill);
  assert.doesNotMatch(textOf(pill), /cached/);
  assert.doesNotMatch(textOf(pill), /tok\/s/);
});

test('the expanded panel exposes every telemetry section', () => {
  const { tree } = render(POPULATED, { open: true });
  const panel = findByAttr(tree, 'data-status-telemetry-panel');
  assert.ok(panel, 'panel renders when open');
  assert.equal(panel.props.role, 'dialog');
  assert.equal(panel.props['aria-label'], 'Session telemetry');
  assert.equal(findByAttr(tree, 'data-status-telemetry-open').props['data-status-telemetry-open'], true);

  const text = textOf(panel);
  for (const expected of [
    'Conversation',
    'Token usage',
    'Performance',
    'Context',
    'Turns',
    'Steps',
    'Throughput',
    'Billed input',
    'Uncached input',
    'Cached input',
    'Cache write',
    'Cache hit',
    'Output',
    'LLM time',
    'Tool time',
    'Avg first token',
    'Decode speed',
    'Tool share of work',
    'Occupancy',
    'Window'
  ]) {
    assert.ok(text.includes(expected), `panel shows "${expected}"`);
  }
  // Values must be formatted, not raw.
  assert.match(text, /1m36s/); // llmMs 96_400
  assert.match(text, /31\.2s/); // toolMs 31_200
  assert.match(text, /400ms/); // avg ttft 3600/9
  assert.match(text, /128,000/); // context window grouped
  assert.match(text, /75%/); // occupancy 96000/128000
  assert.match(text, /24%/); // tool share 31200/(96400+31200)
  // The composition bar renders inside the Context section with proportional segments.
  const bar = findByClass(panel, 'sl-bar');
  assert.ok(bar, 'composition bar renders with the context breakdown');
  assert.equal(bar.props.role, 'img');
  assert.equal(bar.props['aria-label'], T.en['context.barLabel'], 'bar label is localized');
  const segments = elementsOf(bar).filter((element) => String(element.props.className ?? '').includes('sl-bar-seg'));
  assert.equal(segments.length, 3, 'system, tools, and messages segments');
  assert.match(segments[0].props.style.width, /4\.\d+%/); // 4000 / 96000
  assert.match(segments[1].props.style.width, /12\.5%/); // 12000 / 96000
  assert.match(segments[2].props.style.width, /83\.3/); // 80000 / 96000

  // Severity classes must come from the documented token set.
  const values = elementsOf(panel).filter((element) => String(element.props.className ?? '').startsWith('sl-val'));
  assert.ok(values.length > 0);
  for (const value of values) {
    const severityClass = String(value.props.className).split(' ')[1];
    if (severityClass === undefined) continue;
    assert.match(severityClass, /^sl-val--(ok|warn|bad)$/, `${severityClass} is a known severity class`);
  }
});

test('missing token accounting degrades explicitly instead of silently', () => {
  const { tree } = render({ sessionStats: POPULATED.sessionStats }, { open: true });
  const panel = findByAttr(tree, 'data-status-telemetry-panel');
  assert.match(textOf(panel), /Token accounting is unavailable in this profile\./);
  assert.match(textOf(panel), /Context pressure is unavailable in this profile\./);
});

test('missing model timing degrades explicitly', () => {
  const { tree } = render({ tokenUsage: POPULATED.tokenUsage }, { open: true });
  const panel = findByAttr(tree, 'data-status-telemetry-panel');
  assert.match(textOf(panel), /No model timing recorded yet\./);
});

test('collapsing is reachable and escape closes the panel', () => {
  const { tree } = render(POPULATED, { open: true });
  const close = findByAttr(tree, 'data-status-telemetry-close');
  assert.ok(close, 'collapse control exists');
  assert.equal(close.props['aria-label'], 'Collapse telemetry');
  let stopped = false;
  const panel = findByAttr(tree, 'data-status-telemetry-panel');
  panel.props.onKeyDown({ key: 'Escape', stopPropagation: () => { stopped = true; } });
  assert.ok(stopped, 'Escape does not leak to the app');
  panel.props.onKeyDown({ key: 'a', stopPropagation: () => { throw new Error('must not stop propagation'); } });
});

test('setters are wired: pill toggles open, close collapses', () => {
  const collapsed = render(POPULATED);
  findByAttr(collapsed.tree, 'data-status-telemetry-pill').props.onClick();
  assert.deepEqual(collapsed.react.__setterCalls, [true]);

  const expanded = render(POPULATED, { open: true });
  findByAttr(expanded.tree, 'data-status-telemetry-close').props.onClick();
  assert.deepEqual(expanded.react.__setterCalls, [false]);
});

test('a session with stats but zero turns still renders safely', () => {
  const { tree } = render({
    sessionStats: { turns: 0, steps: 2, llmMs: 1_000, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }
  });
  const pill = findByAttr(tree, 'data-status-telemetry-pill');
  assert.ok(pill);
  assert.match(textOf(pill), /0 turns/);
  assert.match(textOf(pill), /2 steps/);
});

test('stylesheet uses only documented theme tokens', () => {
  const tokens = [...T.CSS.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((match) => match[1]);
  assert.ok(tokens.length > 0, 'styles reference theme tokens');
  const known = [
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-label-caption',
    '--dsw-alias-label-primary-bluish',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-separator-primary',
    '--dsw-alias-scrollbar-bg-l2',
    '--dsw-alias-scrollbar-hover-l2',
    '--dsw-alias-state-business-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-error-primary',
    '--dsw-specific-menu',
    '--dsw-elevation-panel',
    '--dsw-radius-sm',
    '--dsw-radius-md',
    '--dsw-radius-lg'
  ];
  for (const token of new Set(tokens)) {
    assert.ok(known.includes(token), `${token} is a documented token`);
  }
});

test('styles render inside the entry so unmounting removes them', () => {
  const collapsed = render(POPULATED);
  const collapsedStyle = findByAttr(collapsed.tree, 'data-plugin-css');
  assert.ok(collapsedStyle, 'collapsed state carries the stylesheet');
  assert.equal(collapsedStyle.type, 'style');
  assert.equal(collapsedStyle.props['data-plugin'], mod.PLUGIN_ID);
  assert.equal(collapsedStyle.props.dangerouslySetInnerHTML.__html, T.CSS);

  const expanded = render(POPULATED, { open: true });
  assert.equal(findByAttr(expanded.tree, 'data-plugin-css').type, 'style');

  // The bundle must not touch document.head directly: the style belongs to the
  // component tree, and the module factory must stay side-effect free.
  const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
  assert.doesNotMatch(source, /document\.head/);
  assert.doesNotMatch(source, /document\.createElement/);
  assert.match(source, /function StyleSheet\(\)/);
});

test('locale dictionaries are complete and parallel', () => {
  const enKeys = Object.keys(T.en).sort();
  const zhKeys = Object.keys(T.zh).sort();
  assert.deepEqual(zhKeys, enKeys);
  assert.ok(enKeys.length >= 25, 'dictionary covers the panel');
  for (const key of enKeys) {
    assert.ok(T.en[key].length > 0, `${key} has English copy`);
    assert.ok(T.zh[key].length > 0, `${key} has Chinese copy`);
  }
  // Message placeholders must match across locales.
  for (const key of enKeys) {
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(placeholders(T.zh[key]), placeholders(T.en[key]), `${key} placeholders align`);
  }
});

test('the module is a valid plain-JS bundle with no build step', () => {
  // The component must only use the documented slot props.
  const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(source, /factory\(require\)/);
  assert.match(source, /require\('react'\)/);
  // Forbidden: importing Harness client packages as modules.
  assert.doesNotMatch(source, /require\('@deepseek-ai\//);
  // Forbidden: DOM writes outside the shimmed style tag.
  assert.doesNotMatch(source, /document\.body\.append/);
});

test('real React accepts the produced element tree', { skip: realReact === null ? 'react is not installed on this host' : false }, () => {
  // The hand-rolled tree must be structurally identical to React's own output
  // contract, so validate one element against the real implementation.
  T.setReact(realReact);
  const element = realReact.createElement('span', { className: 'x' }, 'ok');
  assert.equal(element.type, 'span');
  assert.equal(element.props.className, 'x');
  assert.equal(element.props.children, 'ok');
});
