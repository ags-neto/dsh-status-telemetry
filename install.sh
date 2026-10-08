#!/usr/bin/env bash
#
# Install or remove the status-telemetry plugin for the DSH web profile.
#
# Must run as root on the Pi: / is mounted read-only in normal operation, so the
# script remounts it read-write, installs, and remounts read-only again.
#
#   sudo ./install.sh              # install (or update) the plugin
#   sudo ./install.sh --uninstall  # remove it, restoring the profile
#   sudo ./install.sh --no-remount # fail instead of remounting / read-write
#
# Idempotent: re-running replaces the installed copy and re-asserts the profile
# rows without duplicating anything.
set -euo pipefail

readonly PLUGIN_NAME='@local/dsh-status-telemetry'
readonly ROW_ID='status-telemetry'

profile_dir="${DSH_PROFILE_DIR:-/home/dsh/.dsh/profiles/web}"
src_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mode='install'
allow_remount=1

for arg in "$@"; do
  case "$arg" in
    --uninstall) mode='uninstall' ;;
    --no-remount) allow_remount=0 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

log()  { printf '  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf '\nerror: %s\n' "$*" >&2; exit 1; }

[ -d "$profile_dir" ] || die "profile directory not found: $profile_dir"

readonly profile_json="$profile_dir/package.json"
readonly owner="$(stat -c '%U:%G' "$profile_dir")"
readonly as_root="$([ "$(id -u)" -eq 0 ] && echo 1 || echo 0)"

# --- read-only root handling ------------------------------------------------
# Root is needed only when the profile lives on a read-only mount and must be
# remounted, or when ownership has to be restored. A user who can already write
# the profile (a widened mount, or the profile's own owner) installs without it.
remounted=0
ensure_writable() {
  if [ -w "$profile_dir" ]; then return 0; fi
  [ "$as_root" -eq 1 ] || die "$profile_dir is not writable; re-run as root (sudo $0 $*)"
  [ "$allow_remount" -eq 1 ] || die "$profile_dir is not writable and --no-remount was given"
  step "remounting / read-write (profile is on the read-only root)"
  mount -o remount,rw / || die "could not remount / read-write"
  remounted=1
}

restore_ro() {
  [ "$remounted" -eq 1 ] || return 0
  step "restoring / to read-only"
  sync
  mount -o remount,ro / || log "warning: / left read-write; remount it manually when convenient"
  remounted=0
}

# Only root may change ownership, and only root's remount may need undoing.
restore_owner() {
  [ "$as_root" -eq 1 ] || return 0
  step "restoring ownership"
  chown -R "$owner" "$profile_dir"
}

trap 'restore_ro' EXIT

ensure_writable

# --- profile edits ----------------------------------------------------------
# The editor lives beside this script so it can be tested on its own; it keeps
# the profile manifest valid JSON and the operation idempotent.
edit_profile() { # <add|remove>
  node "$src_dir/profile-bundles.mjs" "$1" "$profile_json" "$PLUGIN_NAME"
}


# --- host steps -------------------------------------------------------------
target_dir="$profile_dir/node_modules/$PLUGIN_NAME"

if [ "$mode" = 'uninstall' ]; then
  step "deregistering the bundle"
  # Removing the bundle is enough: the bundle's own patch supplies its row.
  edit_profile remove

  step "removing installed package"
  if [ -d "$target_dir" ]; then
    rm -rf -- "${target_dir:?}"
    log "removed $target_dir"
  else
    log "not installed at $target_dir"
  fi

  restore_owner
  restore_ro
  printf '\nRemoved %s. Reload the web page; no restart is required.\n' "$PLUGIN_NAME"
  exit 0
fi

step "installing package into the profile"
mkdir -p "$profile_dir/node_modules/$PLUGIN_NAME"
for file in package.json index.js client.js cordis.patch.yml; do
  [ -f "$src_dir/$file" ] || die "missing source file: $src_dir/$file"
  install -m 0644 "$src_dir/$file" "$target_dir/$file"
  log "installed $file"
done

step "registering the bundle"
# Only the bundle list is edited. Listing the bundle composes its own
# cordis.patch.yml, which inserts the status-telemetry row; inserting that row
# into the profile patch as well would load the plugin twice, and the second
# slot registration at the same id and priority would throw.
edit_profile add

restore_owner

restore_ro

printf '\nInstalled %s\n' "$PLUGIN_NAME"
printf '  profile:   %s\n' "$profile_dir"
printf '  installed: %s\n' "$target_dir"
printf '  Loader row: %s (from the bundle patch)\n' "$ROW_ID"
printf '\nReload the web page (hard refresh). The profile watcher recomposes the\n'
printf 'composition live; if the entry does not appear, restart the service:\n'
printf '  sudo systemctl restart dsh.service\n'
