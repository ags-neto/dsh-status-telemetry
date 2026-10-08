/**
 * Host half of the status-telemetry bundle.
 *
 * The Client module owns everything the user sees; this half only has to exist
 * and be mountable so the Loader row resolves and `client-modules` can derive
 * the browser bundle path from this package's manifest.
 */

/** Mount the host half. It contributes no host-side behaviour. */
export function apply() {}
