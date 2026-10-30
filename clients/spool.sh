# Spool's hooks: install the release, keep a profile of its own, empty it for
# a first sync. Sourced by harness/run.sh after the client's JSON is loaded,
# with BENCH, PROFILE, PORT and APP_PATH set.

SPOOL_DMG_URL="${SPOOL_DMG_URL:-https://github.com/wes/spool-releases/releases/latest/download/Spool.dmg}"

# The release, from the same URL a person downloads it from, into
# /Applications the way they would install it.
client_install() {
  local tmp mnt
  tmp="$(mktemp -d)"; mnt="$tmp/mnt"
  say "downloading $SPOOL_DMG_URL"
  curl -fL --progress-bar -o "$tmp/Spool.dmg" "$SPOOL_DMG_URL"
  hdiutil attach -nobrowse -readonly -quiet -mountpoint "$mnt" "$tmp/Spool.dmg"
  if pgrep -x spool >/dev/null; then
    say "quitting the running Spool first"
    osascript -e 'quit app id "com.joedesigns.spool"' 2>/dev/null || pkill -x spool || true
    sleep 2
  fi
  rm -rf /Applications/Spool.app
  ditto "$mnt/Spool.app" /Applications/Spool.app
  hdiutil detach -quiet "$mnt"
  rm -rf "$tmp"
  say "installed Spool $(app_version /Applications/Spool.app) at /Applications/Spool.app"
}

# `initial_limit` is larger than the corpus on purpose: the default would have
# Spool sync a fraction of what the other clients sync, which is the easiest
# way to accidentally win a benchmark.
client_account() {
  mkdir -p "$PROFILE/config/spool" "$PROFILE/data"
  if [[ -f "$PROFILE/config/spool/accounts.toml" ]]; then
    say "the benchmark profile already has an account: $PROFILE/config/spool/accounts.toml"
    return 0
  fi
  cat >"$PROFILE/config/spool/accounts.toml" <<TOML
[[accounts]]
name = "Bench"
email = "bench@example.com"
auth = "password"
imap_host = "127.0.0.1"
imap_port = $PORT
imap_security = "plaintext"
smtp_host = "127.0.0.1"
smtp_port = 10025
smtp_security = "plaintext"
password = "bench"
initial_limit = 1000000
TOML
  say "account written to $PROFILE/config/spool/accounts.toml"
}

# Through Launch Services, as every client is started: macOS then counts the
# WebKit processes that render its mail as Spool's, where a binary started
# from a shell has them charged to the terminal.
client_up() {
  [[ -f "$PROFILE/config/spool/accounts.toml" ]] || client_account
  open -a "$APP_PATH" ${LAUNCH_ENV[@]+"${LAUNCH_ENV[@]}"} \
    --stdout "$BENCH/spool.log" --stderr "$BENCH/spool.log"
  say "Spool started on the benchmark profile $PROFILE (log: $BENCH/spool.log)"
}

# Moved aside, never deleted, so a store that took an hour to build is not
# lost to a typo.
client_reset() {
  local data="$PROFILE/data"
  [[ -d "$data" ]] && mv "$data" "$data.$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$data"
}
