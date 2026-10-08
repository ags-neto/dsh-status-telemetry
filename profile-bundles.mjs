/**
 * Add or remove the status-telemetry bundle in a DSH profile manifest.
 *
 *   node profile-bundles.mjs <add|remove> <profile-package.json> <plugin-name>
 *
 * The bundle list in `dsh.profile.bundles` is the single registration point: a
 * profile composes its bundles plus its own cordis.patch.yml, so listing the
 * bundle applies that bundle's own patch. The profile patch is never touched.
 *
 * Idempotent, and a `remove` restores the list to exactly what `add` found.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [action, profileJson, pluginName] = process.argv.slice(2);

if (action !== 'add' && action !== 'remove') {
  console.error(`usage: profile-bundles.mjs <add|remove> <profile-package.json> <plugin-name>`);
  process.exit(2);
}
if (!profileJson || !pluginName) {
  console.error('usage: profile-bundles.mjs <add|remove> <profile-package.json> <plugin-name>');
  process.exit(2);
}

let doc;
try {
  doc = JSON.parse(readFileSync(profileJson, 'utf8'));
} catch (error) {
  console.error(`cannot read profile manifest ${profileJson}: ${error.message}`);
  process.exit(1);
}

const bundles = doc?.dsh?.profile?.bundles;
if (!Array.isArray(bundles)) {
  console.error(`profile manifest ${profileJson} has no dsh.profile.bundles array`);
  process.exit(1);
}

// The list holds bare package names: the loader resolves each entry through
// Node's node_modules lookup from the profile directory, so the package only
// has to sit in `<profile>/node_modules/<name>`. A `file:` specifier is not a
// package name and the loader skips it at startup.
const specifier = pluginName;

if (action === 'add') {
  if (bundles.includes(specifier)) {
    console.log(`bundles already lists ${pluginName}`);
  } else {
    bundles.push(specifier);
    console.log(`bundled ${pluginName}`);
  }
} else {
  const before = bundles.length;
  // Also drop a legacy `file:` specifier, in case an older install used one.
  for (const candidate of [specifier, pluginName]) {
    const at = bundles.indexOf(candidate);
    if (at !== -1) bundles.splice(at, 1);
  }
  console.log(bundles.length < before ? `unbundled ${pluginName}` : `bundles does not list ${pluginName}`);
}

writeFileSync(profileJson, `${JSON.stringify(doc, null, 2)}\n`);
