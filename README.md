# status-telemetry — rich session status for the DSH composer dock

A DSH **client plugin bundle** that contributes a session status pill to the
`conversation.composer.dock` slot. It sits beside the built-in chat stats entry
and expands in place into a full telemetry panel.

This replaces nothing: the shipped `stats` entry keeps its id and continues to
render. Disabling this bundle restores the previous UI exactly.

## What it shows

Collapsed — one line, in the host's own type and colour language:

```
◔ ● 12 turns · 41 steps · 634k tok · 84% cached · 150 tok/s
```

The glyph dot is a live health reading derived from decode speed
(`ok` / `warn` / `bad`).

Expanded — four sections:

| Section | Readings |
|---|---|
| Conversation | Turns, steps, throughput, output tokens |
| Token usage | Total, billed input, uncached input, cached input, cache write, cache-hit share |
| Performance | LLM time, tool time, average first token, decode speed, tool share of work |
| Context | Occupancy (share of the advertised window), window size, projected prompt, reported prompt, plus a composition bar for system / tools / messages |

Every reading is *derived* from host-computed projections — no client-side log
folding, no polling, no model calls. When a capability is absent in the current
profile, the panel says so instead of rendering a misleading zero.

## Data sources

| Projection | Owner package | Used for |
|---|---|---|
| `sessionStats` | `@deepseek-ai/dsh-session-stats` | turns, steps, LLM/tool/TTFT/decode wall time |
| `tokenUsage` | `@deepseek-ai/dsh-token-meter` | uncached/cached/cache-write input, output |
| `contextPressure` | `@deepseek-ai/dsh-token-meter` | occupancy, window, projected and reported prompt |
| `contextBreakdown` | `@deepseek-ai/dsh-token-meter` | system / tools / messages composition |

Everything reaches the component through the slot framework's standard session
kit (`useProjection`) and locale service. The bundle imports exactly one module,
`react`, from the browser module table.

## Layout

| File | Purpose |
|---|---|
| `package.json` | Bundle manifest: `dsh.bundle.patch` plus `dsh.client` (`platform: web`) |
| `cordis.patch.yml` | Inserts the `status-telemetry` Loader row |
| `index.js` | Host half; mountable, contributes no host behaviour |
| `client.js` | Browser half: the ModuleLoader factory, component, styles, locale |
| `test/client.test.mjs` | Offline suite: formatters, rendered output, registration contract |
| `install.sh` | Root install / uninstall for the profile |

## Install

The plugin is installed into the DSH profile, **not** into `/opt/dsh`. On this
host `/` is mounted read-only, so installing needs root once:

```bash
sudo /srv/workspaces/infra/status-telemetry/install.sh
```

The script remounts `/` read-write, copies the package to
`$DSH_PROFILE_DIR/node_modules/@local/dsh-status-telemetry`, appends the bundle to
`dsh.profile.bundles`, restores ownership, and remounts read-only. It is
idempotent, and `--uninstall` removes everything it added, byte-for-byte
restoring the profile `package.json`.

**Only the bundle list is edited.** A profile composes its bundles plus its own
`cordis.patch.yml`, and listing a bundle applies that bundle's `dsh.bundle.patch`
— so this package's `cordis.patch.yml` supplies the `status-telemetry` Loader
row. Adding that row to the profile patch as well would load the plugin twice,
and the second slot registration at the same id and priority would throw.

Then hard-refresh the page. The profile watcher recomposes the composition live;
`dsh-client-hmr` re-serves an edited `client.js` within ~500 ms. A restart is
only needed if the row does not appear:

```bash
sudo systemctl restart dsh.service   # rotates the web token; re-fetch on 401
```

## Test

```bash
cd /srv/workspaces/infra/status-telemetry
node --test test/client.test.mjs
```

React is not present on the Node side of this host (the browser resolves it from
the boot module table), so the suite exercises the component through a small
React double that mimics hook dispatch and element creation; the one cross-check
against real React skips itself when React is unavailable. The suite cannot
verify visual appearance in the live GUI.

## Design notes

- **A distinct entry, not a shadow.** `conversation.composer.dock` is a `list`
  slot with unique ids: a second registration at the same `priority` throws, and
  reusing `id: "stats"` would require `priority: -1` shadowing. Adding a new id
  keeps the built-in entry intact and makes the change reversible by disabling
  one row.
- **Styles ride the component.** The stylesheet is rendered as a `<style>`
  element inside the entry, so unmounting removes it and the module factory stays
  side-effect free.
- **Theme tokens only.** Every colour, radius, and elevation comes from
  `--dsw-*` tokens, so the panel follows light/dark switching and future theme
  changes.
- **No Harness package imports.** Only `react` is required; the entry reads data
  through props and renders its own controls.
