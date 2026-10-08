/**
 * Browser half of @local/dsh-status-telemetry.
 *
 * Contributes one entry to the `conversation.composer.dock` list slot: a
 * session status pill that expands into a full telemetry panel. It sits beside
 * the built-in chat stats entry (which keeps the id `stats`); this entry uses
 * its own id so both coexist.
 *
 * Only session projections and locale are consumed, so the entry needs no
 * host-side service beyond `slots`.
 *
 * Hand-written in the ModuleLoader bundle format, matching the shipped
 * `templates/decoration/client.js` shape: executing the bundle registers a
 * lazy factory and has no side effects.
 */
const PLUGIN_ID = '@local/dsh-status-telemetry';
const NS = 'statusTelemetry';
const SLOT = 'conversation.composer.dock';
const ENTRY_ID = 'status-telemetry';

/** Style tag identity; one tag per plugin, removed with the bundle's styles. */
const STYLE_TAG_ID = PLUGIN_ID + '/status-telemetry.css';

/** Decode-speed thresholds in tokens/second. */
const TPS_GOOD = 50;
const TPS_FAIR = 20;

/** Average TTFT thresholds in milliseconds. */
const TTFT_GOOD_MS = 800;
const TTFT_FAIR_MS = 2500;

/** Context-occupancy thresholds as a share of the advertised window (0-1). */
const CONTEXT_GOOD = 0.7;
const CONTEXT_FAIR = 0.9;

/** Cache-hit share below which a session is worth flagging (0-1). */
const CACHE_LOW = 0.3;

const CSS = [
  '.sl-root{box-sizing:border-box;width:100%;display:flex;justify-content:center;font-size:12px;line-height:18px}',
  '.sl-pill{display:flex;align-items:center;gap:6px;max-width:100%;padding:2px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}',
  '.sl-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.sl-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
  '.sl-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
  '.sl-icon{flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary)}',
  '.sl-label{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.sl-sep{color:var(--dsw-alias-label-caption)}',
  '.sl-count{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
  '.sl-unit{color:var(--dsw-alias-label-tertiary)}',
  '.sl-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-caption)}',
  '.sl-dot--ok{background:var(--dsw-alias-state-business-primary)}',
  '.sl-dot--warn{background:var(--dsw-alias-state-warn-primary)}',
  '.sl-dot--bad{background:var(--dsw-alias-state-error-primary)}',
  '.sl-panel{width:100%;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);box-shadow:var(--dsw-elevation-panel);max-height:min(58vh,520px);overflow-y:auto;overscroll-behavior:contain;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
  '.sl-head{display:flex;align-items:center;gap:8px}',
  '.sl-title{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.sl-actions{display:flex;align-items:center;gap:4px}',
  '.sl-close{display:grid;place-items:center;padding:2px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
  '.sl-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.sl-section{display:flex;flex-direction:column;gap:5px}',
  '.sl-section + .sl-section{padding-top:9px;border-top:1px solid var(--dsw-alias-separator-primary, var(--dsw-alias-border-l1))}',
  '.sl-caption{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}',
  '.sl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:6px 14px}',
  '.sl-cell{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0}',
  '.sl-key{color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.sl-val{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
  '.sl-val--ok{color:var(--dsw-alias-state-business-primary)}',
  '.sl-val--warn{color:var(--dsw-alias-state-warn-primary)}',
  '.sl-val--bad{color:var(--dsw-alias-state-error-primary)}',
  '.sl-note{color:var(--dsw-alias-label-tertiary);font-size:11px}',
  '.sl-absent{color:var(--dsw-alias-label-caption);font-style:italic}',
  '.sl-bar{display:flex;height:4px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-border-l1)}',
  '.sl-bar-seg{display:block;height:100%}',
  '.sl-bar-seg--system{background:var(--dsw-alias-state-business-primary)}',
  '.sl-bar-seg--tools{background:var(--dsw-alias-label-primary-bluish, var(--dsw-alias-state-business-primary))}',
  '.sl-bar-seg--messages{background:var(--dsw-alias-label-caption)}'
].join('');

/**
 * The plugin stylesheet, rendered as a React element inside the dock entry.
 * Mounting the entry inserts it and unmounting removes it, so the plugin leaves
 * no trace in the document when it is disabled.
 */
function StyleSheet() {
  return React.createElement('style', {
    'data-plugin-css': STYLE_TAG_ID,
    'data-plugin': PLUGIN_ID,
    dangerouslySetInnerHTML: { __html: CSS }
  });
}

/** Round to one decimal without trailing `.0`. */
function round1(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Thousands-separated integer. */
function group(value) {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

/** Compact token count: 1.2M, 34.5k, 812. */
function compactTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return round1(n / 1e6) + 'M';
  if (n >= 1e3) return round1(n / 1e3) + 'k';
  return String(Math.round(n));
}

/** Compact duration: 812ms, 45.2s, 2m42s, 1h03m. */
function compactDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '0ms';
  if (n < 1000) return Math.round(n) + 'ms';
  const seconds = n / 1000;
  if (seconds < 60) return round1(seconds) + 's';
  const whole = Math.round(seconds);
  if (whole < 3600) return Math.floor(whole / 60) + 'm' + String(whole % 60).padStart(2, '0') + 's';
  return Math.floor(whole / 3600) + 'h' + String(Math.floor((whole % 3600) / 60)).padStart(2, '0') + 'm';
}

/** Prompt-side billed input across the three disjoint buckets. */
function billedInput(usage) {
  return (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0);
}

/** Cache-hit share of billed input, or null when nothing was billed. */
function cacheHitRatio(usage) {
  const total = billedInput(usage);
  if (total <= 0) return null;
  return (usage.cacheReadTokens || 0) / total;
}

/** Percentage text; keeps sub-100 rounding honest for near-perfect hits. */
function percentText(ratio) {
  const percent = ratio * 100;
  if (percent >= 99.95) return '100';
  if (percent >= 10) return String(Math.round(percent));
  return round1(percent);
}

/** Tokens/second over decode time, or null when decode time is unknown. */
function tokensPerSecond(stats) {
  if (!stats || !(stats.decodeMs > 0) || !(stats.decodeTokens > 0)) return null;
  return stats.decodeTokens / (stats.decodeMs / 1000);
}

/** Average TTFT in milliseconds, or null when no step reported a first token. */
function averageTtft(stats) {
  if (!stats || !(stats.ttftSteps > 0)) return null;
  return stats.ttftMs / stats.ttftSteps;
}

/** Context occupancy share of the advertised window, or null when unknown. */
function contextOccupancy(pressure) {
  if (!pressure || !(pressure.contextWindow > 0)) return null;
  const used = pressure.projectedTokens ?? pressure.pressureTokens;
  if (!(used > 0)) return null;
  return Math.min(1, used / pressure.contextWindow);
}

/** Severity bucket for a value against descending thresholds. */
function severity(value, good, fair) {
  if (value === null || value === undefined) return 'none';
  if (value >= good) return 'ok';
  if (value >= fair) return 'warn';
  return 'bad';
}

/** Severity for a share where lower is better. */
function severityInverse(value, good, fair) {
  if (value === null || value === undefined) return 'none';
  if (value <= good) return 'ok';
  if (value <= fair) return 'warn';
  return 'bad';
}

/** Per-document SVG helpers. */
function svgProps(size) {
  return {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  };
}

/** Gauge glyph matching the host's stats affordance. */
function GaugeIcon({ size = 14 }) {
  const h = React.createElement;
  return h(
    'svg',
    svgProps(size),
    h('path', { d: 'M2.2 11.4a6.2 6.2 0 1 1 11.6 0' }),
    h('path', { d: 'M8 11.2 10.9 7.3' }),
    h('circle', { cx: 8, cy: 11.4, r: 1 })
  );
}

/** Close glyph for the expanded panel. */
function CloseIcon({ size = 12 }) {
  const h = React.createElement;
  return h('svg', svgProps(size), h('path', { d: 'M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8' }));
}

/**
 * One labelled reading.
 * @param props - label, formatted value, optional severity, optional note.
 */
function Cell({ label, value, severity: state, note }) {
  const h = React.createElement;
  const valueClass = state && state !== 'none' ? 'sl-val sl-val--' + state : 'sl-val';
  return h(
    'div',
    { className: 'sl-cell' },
    h('span', { className: 'sl-key' }, label),
    note
      ? h('span', null, h('span', { className: valueClass }, value), h('span', { className: 'sl-note' }, ' ', note))
      : h('span', { className: valueClass }, value)
  );
}

/** A titled block of readings. */
function Section({ title, children }) {
  const h = React.createElement;
  return h('section', { className: 'sl-section' }, h('div', { className: 'sl-caption' }, title), h('div', { className: 'sl-grid' }, children));
}

/** Message rows rendered when no projection has arrived yet. */
function Absent({ children }) {
  const h = React.createElement;
  return h('div', { className: 'sl-absent' }, children);
}

/** Composed context bar: system / tools / messages shares. */
function CompositionBar({ breakdown, t }) {
  const h = React.createElement;
  const total = (breakdown.systemTokens || 0) + (breakdown.toolsTokens || 0) + (breakdown.messageTokens || 0);
  if (!(total > 0)) return h(Absent, null, t('context.absent'));
  const segments = [
    ['system', breakdown.systemTokens || 0],
    ['tools', breakdown.toolsTokens || 0],
    ['messages', breakdown.messageTokens || 0]
  ];
  return h(
    'div',
    { className: 'sl-bar', role: 'img', 'aria-label': t('context.barLabel') },
    segments.map(([kind, tokens]) =>
      h('span', { key: kind, className: 'sl-bar-seg sl-bar-seg--' + kind, style: { width: (tokens / total) * 100 + '%' } })
    )
  );
}

/**
 * Session status pill and telemetry panel.
 *
 * Props are supplied by the slot framework: `useProjection` reads host-computed
 * session projections, `t` is the bound locale function for this plugin's
 * namespace.
 */
function StatusTelemetry({ useProjection, t }) {
  const h = React.createElement;
  const [open, setOpen] = React.useState(false);
  const usage = useProjection('tokenUsage');
  const stats = useProjection('sessionStats');
  const pressure = useProjection('contextPressure');
  const breakdown = useProjection('contextBreakdown');

  const speed = tokensPerSecond(stats);
  const cacheHit = usage !== undefined && usage !== null ? cacheHitRatio(usage) : null;
  const turns = stats ? stats.turns : 0;
  const steps = stats ? stats.steps : 0;
  const totalTokens = usage !== undefined && usage !== null ? billedInput(usage) + (usage.outputTokens || 0) : 0;

  // Nothing durable has been recorded for this session yet: stay out of the way.
  if (steps === 0 && totalTokens === 0) return null;

  const speedState = severity(speed, TPS_GOOD, TPS_FAIR);

  const summary = [
    h('span', { key: 'turns', className: 'sl-count' }, group(turns)),
    h('span', { key: 'turns-u', className: 'sl-unit' }, turns === 1 ? ' turn' : ' turns'),
    h('span', { key: 'sep1', className: 'sl-sep', 'aria-hidden': true }, '·'),
    h('span', { key: 'steps', className: 'sl-count' }, group(steps)),
    h('span', { key: 'steps-u', className: 'sl-unit' }, steps === 1 ? ' step' : ' steps')
  ];
  if (totalTokens > 0) {
    summary.push(h('span', { key: 'sep2', className: 'sl-sep', 'aria-hidden': true }, '·'));
    summary.push(h('span', { key: 'tok', className: 'sl-count' }, compactTokens(totalTokens)));
    summary.push(h('span', { key: 'tok-u', className: 'sl-unit' }, ' tok'));
  }
  if (cacheHit !== null) {
    summary.push(h('span', { key: 'sep3', className: 'sl-sep', 'aria-hidden': true }, '·'));
    summary.push(h('span', { key: 'cache', className: 'sl-count' }, percentText(cacheHit) + '%'));
    summary.push(h('span', { key: 'cache-u', className: 'sl-unit' }, ' cached'));
  }
  if (speed !== null) {
    summary.push(h('span', { key: 'sep4', className: 'sl-sep', 'aria-hidden': true }, '·'));
    summary.push(h('span', { key: 'tps', className: 'sl-count' }, round1(speed)));
    summary.push(h('span', { key: 'tps-u', className: 'sl-unit' }, ' tok/s'));
  }

  const pill = h(
    'button',
    {
      type: 'button',
      className: 'sl-pill',
      'data-status-telemetry-pill': true,
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      'aria-label': t('pill.aria', { turns: group(turns), steps: group(steps) }),
      onClick: () => setOpen(!open)
    },
    h('span', { className: 'sl-icon' }, h(GaugeIcon, null)),
    speedState !== 'none' ? h('span', { className: 'sl-dot sl-dot--' + speedState, 'aria-hidden': true }) : null,
    h('span', { className: 'sl-label' }, summary)
  );
  if (!open) {
    return h('div', { className: 'sl-root', 'data-status-telemetry': true }, h(StyleSheet, { key: 'style' }), pill);
  }

  const ttft = averageTtft(stats);
  const occupancy = contextOccupancy(pressure);
  const tpsState = severity(speed, TPS_GOOD, TPS_FAIR);
  const ttftState = ttft === null ? 'none' : severityInverse(ttft, TTFT_GOOD_MS, TTFT_FAIR_MS);
  const occupancyState = occupancy === null ? 'none' : severityInverse(occupancy, CONTEXT_GOOD, CONTEXT_FAIR);
  const cacheState = cacheHit === null ? 'none' : cacheHit < CACHE_LOW ? 'warn' : 'ok';

  const conversation = h(
    Section,
    { title: t('section.conversation'), key: 'conversation' },
    h(Cell, { key: 'turns', label: t('count.turns'), value: group(turns) }),
    h(Cell, { key: 'steps', label: t('count.steps'), value: group(steps) }),
    speed !== null ? h(Cell, { key: 'tps', label: t('label.tps'), value: round1(speed) + ' tok/s', severity: tpsState }) : null,
    usage !== undefined && usage !== null && (usage.outputTokens || 0) > 0
      ? h(Cell, { key: 'output', label: t('usage.output'), value: group(usage.outputTokens) })
      : null
  );

  let tokens = null;
  if (usage !== undefined && usage !== null) {
    const billed = billedInput(usage);
    tokens = h(
      Section,
      { title: t('section.tokens'), key: 'tokens' },
      h(Cell, { key: 'total', label: t('usage.total'), value: group(totalTokens) }),
      h(Cell, { key: 'billed', label: t('usage.billed'), value: group(billed) }),
      h(Cell, { key: 'uncached', label: t('usage.uncached'), value: group(usage.uncachedInputTokens || 0) }),
      h(Cell, { key: 'cacheRead', label: t('usage.cacheRead'), value: group(usage.cacheReadTokens || 0) }),
      (usage.cacheWriteTokens || 0) > 0
        ? h(Cell, { key: 'cacheWrite', label: t('usage.cacheWrite'), value: group(usage.cacheWriteTokens) })
        : null,
      cacheHit !== null
        ? h(Cell, {
            key: 'cacheHit',
            label: t('usage.cacheHit'),
            value: percentText(cacheHit) + '%',
            severity: cacheState
          })
        : null
    );
  }

  const performance =
    stats && (stats.llmMs > 0 || stats.toolMs > 0 || ttft !== null || speed !== null)
      ? h(
          Section,
          { title: t('section.performance'), key: 'performance' },
          stats.llmMs > 0 ? h(Cell, { key: 'llm', label: t('perf.llm'), value: compactDuration(stats.llmMs) }) : null,
          stats.toolMs > 0 ? h(Cell, { key: 'tool', label: t('perf.tool'), value: compactDuration(stats.toolMs) }) : null,
          ttft !== null
            ? h(Cell, { key: 'ttft', label: t('perf.ttft'), value: compactDuration(ttft), severity: ttftState })
            : null,
          speed !== null ? h(Cell, { key: 'tps2', label: t('perf.tps'), value: round1(speed) + ' tok/s', severity: tpsState }) : null,
          stats.llmMs > 0 && stats.toolMs > 0
            ? h(Cell, {
                key: 'share',
                label: t('perf.toolShare'),
                value: percentText(Math.min(1, stats.toolMs / (stats.llmMs + stats.toolMs))) + '%'
              })
            : null
        )
      : null;

  const contextParts = [];
  if (pressure && (pressure.pressureTokens || pressure.projectedTokens)) {
    contextParts.push(
      h(Cell, {
        key: 'ctx',
        label: t('context.occupancy'),
        value: occupancy !== null ? percentText(occupancy) + '%' : compactTokens(pressure.projectedTokens ?? pressure.pressureTokens) + ' tok',
        severity: occupancyState
      })
    );
  }
  if (pressure && pressure.contextWindow > 0) {
    contextParts.push(h(Cell, { key: 'window', label: t('context.window'), value: group(pressure.contextWindow) }));
  }
  if (pressure && pressure.projectedTokens > 0) {
    contextParts.push(h(Cell, { key: 'projected', label: t('context.projected'), value: group(pressure.projectedTokens) }));
  }
  if (pressure && pressure.pressureTokens > 0) {
    contextParts.push(h(Cell, { key: 'reported', label: t('context.reported'), value: group(pressure.pressureTokens) }));
  }
  const contextSection = contextParts.length
    ? h(
        Section,
        { title: t('section.context'), key: 'context' },
        contextParts,
        breakdown ? h(CompositionBar, { key: 'bar', breakdown, t }) : null,
        breakdown
          ? h('div', { key: 'legend', className: 'sl-note' }, t('context.legend'))
          : null
      )
    : null;

  const panel = h(
    'div',
    {
      className: 'sl-panel',
      role: 'dialog',
      'data-status-telemetry-panel': true,
      'aria-label': t('panel.title'),
      onKeyDown: (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
        }
      }
    },
    h(
      'div',
      { className: 'sl-head' },
      h('span', { className: 'sl-icon' }, h(GaugeIcon, null)),
      h('span', { className: 'sl-title' }, t('panel.title')),
      h(
        'span',
        { className: 'sl-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'sl-close',
            'data-status-telemetry-close': true,
            'aria-label': t('panel.close'),
            onClick: () => setOpen(false)
          },
          h(CloseIcon, null)
        )
      )
    ),
    conversation,
    tokens,
    tokens === null ? h(Absent, { key: 'notokens' }, t('absent.tokens')) : null,
    performance,
    performance === null ? h(Absent, { key: 'noperf' }, t('absent.performance')) : null,
    contextSection,
    contextSection === null ? h(Absent, { key: 'noctx' }, t('absent.context')) : null
  );

  return h(
    'div',
    { className: 'sl-root sl-root--open', 'data-status-telemetry': true, 'data-status-telemetry-open': true },
    h(StyleSheet, { key: 'style' }),
    pill,
    panel
  );
}

/** English dictionary. Missing keys fall back to the key text. */
const en = {
  'panel.title': 'Session telemetry',
  'panel.close': 'Collapse telemetry',
  'pill.aria': 'Session telemetry: {turns} turns, {steps} steps. Expand for detail.',
  'section.conversation': 'Conversation',
  'section.tokens': 'Token usage',
  'section.performance': 'Performance',
  'section.context': 'Context',
  'count.turns': 'Turns',
  'count.steps': 'Steps',
  'label.tps': 'Throughput',
  'usage.total': 'Total',
  'usage.billed': 'Billed input',
  'usage.uncached': 'Uncached input',
  'usage.cacheRead': 'Cached input',
  'usage.cacheWrite': 'Cache write',
  'usage.cacheHit': 'Cache hit',
  'usage.output': 'Output',
  'perf.llm': 'LLM time',
  'perf.tool': 'Tool time',
  'perf.ttft': 'Avg first token',
  'perf.tps': 'Decode speed',
  'perf.toolShare': 'Tool share of work',
  'context.occupancy': 'Occupancy',
  'context.window': 'Window',
  'context.projected': 'Projected prompt',
  'context.reported': 'Reported prompt',
  'context.legend': 'Composition is a heuristic: system, tools, then messages.',
  'context.barLabel': 'Context composition by heuristic tokens',
  'context.absent': 'No context composition recorded yet.',
  'absent.tokens': 'Token accounting is unavailable in this profile.',
  'absent.performance': 'No model timing recorded yet.',
  'absent.context': 'Context pressure is unavailable in this profile.'
};

const zh = {
  'panel.title': '会话遥测',
  'panel.close': '收起遥测',
  'pill.aria': '会话遥测：{turns} 轮，{steps} 步。展开查看详情。',
  'section.conversation': '会话',
  'section.tokens': 'Token 用量',
  'section.performance': '性能',
  'section.context': '上下文',
  'count.turns': '轮次',
  'count.steps': '步数',
  'label.tps': '吞吐',
  'usage.total': '总计',
  'usage.billed': '计费输入',
  'usage.uncached': '未缓存输入',
  'usage.cacheRead': '缓存读取',
  'usage.cacheWrite': '缓存写入',
  'usage.cacheHit': '缓存命中',
  'usage.output': '输出',
  'perf.llm': '模型耗时',
  'perf.tool': '工具耗时',
  'perf.ttft': '平均首字',
  'perf.tps': '解码速度',
  'perf.toolShare': '工具耗时占比',
  'context.occupancy': '占用',
  'context.window': '窗口',
  'context.projected': '预估提示',
  'context.reported': '上报提示',
  'context.legend': '组成为启发式估算：系统、工具、消息。',
  'context.barLabel': '按启发式 Token 估算的上下文组成',
  'context.absent': '尚无上下文组成记录。',
  'absent.tokens': '此配置不支持 Token 统计。',
  'absent.performance': '尚无模型计时记录。',
  'absent.context': '此配置不支持上下文压力。'
};

let React = null;

/**
 * Mount the Client contributions.
 * @param ctx - Client root context.
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'status-telemetry: dictionaries');
  const t = ctx.locale.bind(NS);
  ctx.slots.inject(SLOT, () =>
    ctx.slots.register(
      {
        name: SLOT,
        id: ENTRY_ID,
        order: 1,
        locale: NS,
        inject: () => ({})
      },
      StatusTelemetry
    )
  );
}

const inject = ['slots', 'locale'];

// Browser: register the lazy factory. Node (tests): export the same values.
if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: PLUGIN_ID,
    factory(require) {
      React = require('react');
      return { inject, apply };
    }
  });
}

export {
  PLUGIN_ID,
  NS,
  SLOT,
  ENTRY_ID,
  inject,
  apply,
  StatusTelemetry,
  Cell,
  Section,
  CompositionBar,
  Absent,
  StyleSheet,
  CSS,
  round1,
  group,
  compactTokens,
  compactDuration,
  billedInput,
  cacheHitRatio,
  percentText,
  tokensPerSecond,
  averageTtft,
  contextOccupancy,
  severity,
  severityInverse,
  en,
  zh
};

/** Internals and seams the offline test suite exercises. */
export const __test = {
  setReact(value) {
    React = value;
  },
  CSS,
  round1,
  group,
  compactTokens,
  compactDuration,
  billedInput,
  cacheHitRatio,
  percentText,
  tokensPerSecond,
  averageTtft,
  contextOccupancy,
  severity,
  severityInverse,
  StatusTelemetry,
  Cell,
  Section,
  CompositionBar,
  Absent,
  StyleSheet,
  en,
  zh,
  /** Values the component treats as thresholds. */
  thresholds: { TPS_GOOD, TPS_FAIR, TTFT_GOOD_MS, TTFT_FAIR_MS, CONTEXT_GOOD, CONTEXT_FAIR, CACHE_LOW }
};
