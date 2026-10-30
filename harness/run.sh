#!/usr/bin/env bash
# The benchmark, end to end. Run it as ./mailbench from the repository root.
#
#   ./mailbench doctor               what this machine has and is missing
#   ./mailbench permissions          ask for Screen Recording + Accessibility, open Settings
#   ./mailbench corpus [50k|250k]    generate the mailbox (or check the one there)
#   ./mailbench server start|stop|status|log|reset
#   ./mailbench calibrate            the instrument's own overhead, on this machine
#   ./mailbench clients              every client definition, and which are installed
#   ./mailbench install <client>     install it, where the definition knows how
#   ./mailbench account <client>     add the benchmark account, or say how
#   ./mailbench up <client>          start it against the benchmark account
#   ./mailbench snapshot <client>    PNG of the window with every region and click marked
#   ./mailbench run <client>...      measure (or `run all`: every one installed and running)
#   ./mailbench launch <client>...   launch and quit only
#   ./mailbench sync <client>        first sync into an empty store, timed at the server
#   ./mailbench report [--markdown]  one table, every client, this machine
#   ./mailbench submit               copy this machine's results into results/ for a pull request
#
# CORPUS=250k measures the second mailbox. TAG=x keeps a build's results apart
# (for an A/B of two builds of one client); APP=/path/to/X.app measures that
# bundle instead of the installed one. ACTIONS="open next" runs a subset of:
# open next scroll search static launch.
#
# Results land in ~/mailbench/results/<machine>-<corpus>/<client>.jsonl: a
# `session` line saying who, what and on which machine, then one JSON object
# per run and a summary per action. Different machines get different
# directories, because their numbers are not comparable and should never meet
# in one table.
#
# BEFORE MEASURING A CLIENT
#   1. ./mailbench server start — the corpus is being served and the server is warm.
#   2. The client is open, its account fully synced, showing the Inbox sorted
#      newest first, with nothing selected. It is the only mail client running.
#   3. Nothing else is animating on screen. A progress bar inside the watched
#      rectangle is a repaint the instrument cannot tell from the one measured.
#   4. `./mailbench snapshot <client>` and look at the picture: the red box
#      must be the pane that changes, the blue crosses must be on message rows.
#      A click two pixels off a row is a measurement of nothing.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BENCH="${MAILBENCH_HOME:-$HOME/mailbench}"
BIN="$HERE/bin"
MEASURE="$BIN/measure"
CALIBRATE="$BIN/calibrate"
RUNS="${RUNS:-20}"
SEARCH_TERM="${SEARCH_TERM:-postmortem}"
CORPUS="${CORPUS:-50k}"

# One size and place for everyone. A taller window shows more rows, and rows are
# the only thing that makes a frame cost more — so an unequal window is an
# unequal test. 1400x900 at (100, 60) fits a 1920x1080 display with the menu bar.
WIN_X=100
WIN_Y=60
WIN_W=1400
WIN_H=900

# What "this machine" is: the CPU, as a slug. Two machines with the same chip
# share a directory locally; `submit` adds the model and the date.
MACHINE="$(sysctl -n machdep.cpu.brand_string | tr '[:upper:]' '[:lower:]' \
           | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//')"
PORT="${PORT:-$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["corpora"].get(sys.argv[2], {}).get("port", 10143))' "$HERE/corpus.json" "$CORPUS")}"
SERVER_STATE="$BENCH/server-$CORPUS"
RESULTS="$BENCH/results/$MACHINE-$CORPUS"
mkdir -p "$RESULTS"

# ------------------------------------------------------------------ clients
#
# A client is clients/<id>.json (the window, the rectangles, the search
# field — see clients/README.md) and, optionally, clients/<id>.sh with hooks:
#
#   client_install    install the client
#   client_account    add the benchmark account to it
#   client_up         start it against the benchmark account (default: open -a)
#   client_reset      empty its store, for a first-sync measurement
#   client_store      print where it keeps the benchmark account
#   client_close_strays   close any window that is not the one measured
#
# Coordinates are window-relative points for a WIN_W x WIN_H window. Check them
# with `snapshot` before trusting them: they are per client layout, and a
# client update that moves a pane moves them.

client_spec() {
  local id="$1"
  unset -f client_install client_account client_up client_reset client_store client_close_strays 2>/dev/null || true
  # A profile of the client's own, for any client that can be pointed at one,
  # so the benchmark account never shares a store with real mail.
  PROFILE="$BENCH/profiles/$id-$CORPUS"
  local spec
  spec="$(python3 "$HERE/client.py" shell "$id" --profile "$PROFILE")" || exit 2
  eval "$spec"
  # APP= measures a particular bundle: a build of your own, before it ships.
  [[ -n "${APP:-}" ]] && APP_PATH="$APP"
  if [[ -f "$ROOT/clients/$id.sh" ]]; then
    # shellcheck source=/dev/null
    source "$ROOT/clients/$id.sh"
  fi
  if declare -f client_store >/dev/null; then STORE="$(client_store || true)"; fi
  return 0
}

all_clients() { python3 "$HERE/client.py" list; }

# ------------------------------------------------------------------- helpers

say() { printf '%s\n' "$*" >&2; }

ensure_tools() {
  local src bin
  mkdir -p "$BIN"
  for bin in measure calibrate; do
    src="$HERE/$bin.swift"
    # Built here rather than committed: a binary built on another machine's
    # macOS is the instrument from a different experiment.
    if [[ ! -x "$BIN/$bin" || "$src" -nt "$BIN/$bin" ]]; then
      command -v swiftc >/dev/null || { say "swiftc not found: xcode-select --install"; exit 1; }
      say "building ${bin}…"
      swiftc -O "$src" -o "$BIN/$bin"
    fi
  done
}

target_args() {
  TARGET=()
  if [[ -n "$BUNDLE" ]]; then TARGET+=(--app "$BUNDLE"); else TARGET+=(--app-name "$APPNAME"); fi
  [[ -n "$TITLE" ]] && TARGET+=(--window-title "$TITLE")
  return 0
}

need_layout() {
  case "$LAYOUT_STATUS" in
    verified) ;;
    unverified) say "  note: $CLIENT_ID's coordinates have never been checked by snapshot. Check them before publishing anything." ;;
    *) say "$CLIENT_ID has no layout yet: add one to clients/$CLIENT_ID.json (see clients/README.md)"; exit 1 ;;
  esac
}

pid_of() { [[ -n "$1" ]] && pgrep -x "$1" | head -1; }

app_version() {
  local plist="$1/Contents/Info.plist"
  [[ -f "$plist" ]] && /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$plist" 2>/dev/null || echo ""
}

client_version() {
  local v=""
  if [[ -n "$VERSION_CMD" ]]; then v="$(bash -c "$VERSION_CMD" 2>/dev/null || true)"
  elif [[ -n "$APP_PATH" ]]; then v="$(app_version "$APP_PATH")"; fi
  # A build from somewhere other than /Applications is not the release, and says so.
  [[ -n "${APP:-}" ]] && v="$v (APP=$(basename "$APP"))"
  printf '%s' "$v"
}

resize() {
  osascript >/dev/null 2>&1 <<OSA || say "  (could not resize $PROC — set it to ${WIN_W}x${WIN_H} at ${WIN_X},${WIN_Y} by hand)"
tell application "System Events"
  tell process "$PROC"
    set frontmost to true
    -- The main window by title where there is one: "front window" is
    -- whatever was last opened, and a stray compose or spelling window
    -- would be the one resized and measured.
    if "$TITLE" is "" then
      set target to front window
    else
      set target to first window whose name contains "$TITLE"
    end if
    perform action "AXRaise" of target
    set position of target to {$WIN_X, $WIN_Y}
    set size of target to {$WIN_W, $WIN_H}
  end tell
end tell
OSA
  sleep 1
}

json_str() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

power_source() { pmset -g batt 2>/dev/null | head -1 | grep -q "AC Power" && echo ac || echo battery; }
low_power() { pmset -g 2>/dev/null | awk '/lowpowermode/ {print $2; exit}'; }

session_line() {
  local client="$1" version="$2"
  local display corpus harness
  display="$(system_profiler SPDisplaysDataType 2>/dev/null \
            | awk -F': ' '/UI Looks like/ {print $2; exit}')"
  # Which mailbox, as server.sh verified it on start.
  corpus="$(cat "$SERVER_STATE/corpus.json" 2>/dev/null || echo '{}')"
  # The harness's own commit, and whether what ran differs from it.
  if harness="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"; then
    git -C "$ROOT" diff --quiet HEAD -- harness clients 2>/dev/null || harness="$harness+dirty"
  else
    harness="unknown"
  fi
  printf '{"event":"session","schema":2,"client":%s,"version":%s,"machine":"%s","model":"%s","cpu":%s,"cores":%s,"memory_bytes":%s,"os":"%s","display":%s,"power":"%s","low_power":"%s","window":"%dx%d","runs":%d,"search_term":%s,"harness":"%s","corpus_name":"%s","corpus":%s,"at":%d}\n' \
    "$(json_str "$client")" "$(json_str "$version")" "$MACHINE" "$(sysctl -n hw.model)" \
    "$(json_str "$(sysctl -n machdep.cpu.brand_string)")" "$(sysctl -n hw.ncpu)" "$(sysctl -n hw.memsize)" \
    "$(sw_vers -productVersion)" "$(json_str "$display")" "$(power_source)" "$(low_power)" \
    "$WIN_W" "$WIN_H" "$RUNS" "$(json_str "$SEARCH_TERM")" "$harness" "$CORPUS" "$corpus" "$(date +%s)"
}

conditions_warn() {
  local load
  load="$(sysctl -n vm.loadavg | awk '{print $2}')"
  if awk -v l="$load" 'BEGIN {exit !(l > 2.0)}'; then
    say "  warning: load average $load — something else is busy, and it lands in the tail of every number"
  fi
  [[ "$(power_source)" == battery ]] && say "  warning: on battery — macOS may slow the machine down to save it; plug in"
  [[ "$(low_power)" == 1 ]] && say "  warning: Low Power Mode is on"
  local others=() c
  for c in $(all_clients); do
    [[ "$c" == "$CLIENT_ID" ]] && continue
    local p; p="$(python3 "$HERE/client.py" get "$c" app.process)"
    [[ -n "$p" && -n "$(pid_of "$p")" ]] && others+=("$c")
  done
  (( ${#others[@]} )) && say "  warning: other mail clients are running (${others[*]}); measure one at a time"
  return 0
}

# ------------------------------------------------------------------- measure

measure_client() {
  local client="$1"
  client_spec "$client"
  # TAG keeps an A/B apart: `TAG=fix APP=… ./mailbench run x` writes
  # x@fix.jsonl, and the report shows it as its own column.
  local name="$client${TAG:+@$TAG}"
  local out="$RESULTS/$name.jsonl"

  if [[ -z "$(pid_of "$PROC")" ]]; then
    say "== $client: not running, skipped (./mailbench up $client)"
    return 1
  fi
  say "== $client =="
  need_layout
  ensure_unlocked
  conditions_warn
  [[ -n "$BUNDLE" ]] && resize
  target_args

  session_line "$name" "$(client_version)" >>"$out"

  # 0. Start from the whole mailbox. A search left in the field by an earlier
  #    pass filters the list to a page of results, and arrowing down a short
  #    list runs off the end and measures nothing.
  clear_search

  # 1. Open a message: click a row, watch the reader pane. Alternates between
  #    two rows, so every click lands on one that is not already selected.
  want open && { say "  open a message"
  "$MEASURE" "${TARGET[@]}" --region "$READER" --click "$ROW" --click-alternate "$ROW_DY" \
      --runs "$RUNS" --label "$name/open-message" >>"$out"; }

  # 2. Next message with the keyboard: the same work without the mouse and
  #    without the row-highlight confound.
  want next && { say "  next message (down arrow)"
  "$MEASURE" "${TARGET[@]}" --region "$READER" --key down \
      --runs "$RUNS" --label "$name/next-message" >>"$out"; }

  # 3. Scroll the list. `settle` is the interesting one: how long after the
  #    wheel stops does the list stop changing. Before search, so the list is
  #    the whole mailbox rather than a page of results.
  want scroll && { say "  scroll"
  "$MEASURE" "${TARGET[@]}" --region "$LIST" --scroll "-8,30" \
      --runs 10 --label "$name/scroll" >>"$out"; }

  # 4. Search. Watch the list, because the results are what the query changes.
  #    Each run empties the field first and lets the full list come back, so
  #    every run types the same query into the same empty field.
  if [[ -n "$SEARCH" ]] && want search; then
    say "  search for '$SEARCH_TERM'"
    [[ -z "$SEARCH_PREPARE" ]] && "$MEASURE" "${TARGET[@]}" --region "$LIST" --click "$SEARCH" \
        --runs 1 --timeout-ms 2000 --label "$name/focus-search" >/dev/null
    "$MEASURE" "${TARGET[@]}" --region "$LIST" --type "$SEARCH_TERM$SEARCH_SUBMIT" \
        --prepare "${SEARCH_PREPARE:-click@${SEARCH/,/:},$SEARCH_CLEAR}" --quiet-ms 1500 \
        --runs "$RUNS" --label "$name/search" >>"$out"
    clear_search
  fi

  want static && static "$name" >>"$out"

  # 6. Launch and quit, last because it restarts the client. Not for a client
  #    without a bundle of its own: a terminal client's launch is the terminal's.
  [[ -n "$BUNDLE" ]] && want launch && launch_cycle "$client" "$name" >>"$out"
  say "  -> $out"
}

# Quit the client, then launch and quit it LAUNCH_RUNS times (run 1 is the
# cold-ish one and is left out of the medians), then start it again for
# whatever comes next. Window position is whatever the client restores, which
# after a measured run is the benchmark size.
launch_cycle() {
  local client="$1" name="$2"
  say "  launch and quit (${LAUNCH_RUNS:-6} cycles)"
  quit_client
  sleep 2
  "$MEASURE" "${TARGET[@]}" --launch "$APP_PATH" ${LAUNCH_ENV[@]+"${LAUNCH_ENV[@]}"} --region "$LIST" \
      --runs "${LAUNCH_RUNS:-6}" --timeout-ms 60000 --label "$name"
  up_client >&2
  sleep 5
}

# Not timed, so a signal as a last resort: an app started from its binary
# rather than by Launch Services does not always answer an AppleScript quit.
quit_client() {
  [[ -n "$BUNDLE" ]] && osascript -e "tell application id \"$BUNDLE\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do [[ -z "$(pid_of "$PROC")" ]] && break; sleep 0.1; done
  pkill -x "$PROC" 2>/dev/null || true
  for _ in $(seq 1 100); do [[ -z "$(pid_of "$PROC")" ]] && break; sleep 0.1; done
}

# Through Launch Services, as a person would and as every client is: macOS then
# charges the helper processes that render a client's mail to that client.
up_client() {
  if declare -f client_up >/dev/null; then client_up
  elif [[ -n "$APP_PATH" ]]; then open -a "$APP_PATH" ${LAUNCH_ENV[@]+"${LAUNCH_ENV[@]}"}
  else say "start $CLIENT_ID by hand: ${ACCOUNT_STEPS[*]:-}"; fi
}

close_strays() {
  if declare -f client_close_strays >/dev/null; then client_close_strays; fi
  return 0
}

# Stops before a run rather than recording twenty timeouts: a locked screen
# captures black and takes no input, and `measure` says so and exits 3.
ensure_unlocked() {
  "$MEASURE" --list >/dev/null || { say "stopping: $MEASURE cannot measure (see above)"; exit 3; }
}

# ACTIONS picks which steps run, e.g. ACTIONS="open next"; all of them by default.
want() { [[ " ${ACTIONS:-open next scroll search static launch} " == *" $1 "* ]]; }

clear_search() {
  close_strays
  [[ -n "$SEARCH" ]] || return 0
  if (( ${#SEARCH_RESET[@]} )); then
    "$MEASURE" "${TARGET[@]}" --region "$LIST" "${SEARCH_RESET[@]}" \
        --runs 1 --timeout-ms 3000 --quiet-ms 500 --label setup >/dev/null
    return 0
  fi
  "$MEASURE" "${TARGET[@]}" --region "$LIST" --click "$SEARCH" \
      --runs 1 --timeout-ms 1000 --quiet-ms 100 --label setup >/dev/null
  "$MEASURE" "${TARGET[@]}" --region "$LIST" --prepare "click@${SEARCH/,/:},$SEARCH_CLEAR" ${SEARCH_DONE[@]+"${SEARCH_DONE[@]}"} \
      --runs 1 --timeout-ms 3000 --quiet-ms 500 --label setup >/dev/null
  close_strays
}

# CPU time a process has used, in seconds. `ps` prints [[dd-]hh:]mm:ss.cc.
cpu_seconds() {
  ps -o time= -p "$1" | awk -F'[:-]' '{ s = 0; for (i = 1; i <= NF; i++) s = s * 60 + $i; print s }'
}

# Memory and disk, after the measurements, with the client idle.
static() {
  local client="$1" pid rss=0 disk=0 memory='{}'
  pid="$(pid_of "$PROC")"
  [[ -n "$pid" ]] && rss="$(ps -o rss= -p "$pid" | tr -d ' ')"
  # What Activity Monitor shows: physical footprint, with the WebKit helpers
  # each client renders mail in. See footprint.py for why not RSS.
  [[ -n "$pid" ]] && memory="$(python3 "$HERE/footprint.py" "$pid" 2>/dev/null || echo '{}')"
  # Apparent size, not allocated blocks: 50,000 one-kilobyte files occupy four
  # times their content in 4K blocks, and that is the filesystem's number.
  [[ -n "$STORE" && -e "$STORE" ]] && disk="$(du -sk -A "$STORE" 2>/dev/null | cut -f1)"
  # Idle CPU: what the client costs sitting there, which is most of its life.
  # Ten seconds of the main process doing nothing it was asked to.
  local idle="null"
  if [[ -n "$pid" ]]; then
    local before after
    before="$(cpu_seconds "$pid")"; sleep 10; after="$(cpu_seconds "$pid")"
    idle="$(python3 -c "print(round(($after - $before) / 10 * 100, 2))")"
  fi
  say "  memory $(python3 -c 'import json,sys; m=json.loads(sys.argv[1]); print(m.get("total_kb",0)//1024, "MB,", m.get("main_kb",0)//1024, "MB main")' "$memory")   store $((disk / 1024)) MB   idle cpu ${idle}%"
  # The path as ~/…, so a published result does not carry a home directory's name.
  local shown="$STORE"
  [[ "$shown" == "$HOME"/* ]] && shown="~${shown#"$HOME"}"
  printf '{"event":"static","client":"%s","rss_kb":%s,"memory":%s,"store_kb":%s,"idle_cpu_pct":%s,"store":%s}\n' \
    "$client" "${rss:-0}" "$memory" "${disk:-0}" "$idle" "$(json_str "$shown")"
}

snapshot() {
  local client="$1"
  client_spec "$client"
  need_layout
  [[ -n "$(pid_of "$PROC")" ]] || { say "$client is not running (./mailbench up $client)"; exit 1; }
  [[ -n "$BUNDLE" ]] && resize
  target_args
  local dir="$RESULTS/snapshots"; mkdir -p "$dir"
  "$MEASURE" "${TARGET[@]}" --region "$READER" --click "$ROW" --click-alternate "$ROW_DY" \
      --snapshot "$dir/$client-reader.png" >/dev/null
  "$MEASURE" "${TARGET[@]}" --region "$LIST" ${SEARCH:+--click "$SEARCH"} \
      --snapshot "$dir/$client-list.png" >/dev/null
  say "red: watched region   blue: where clicks land"
  say "  $dir/$client-reader.png   (open a message)"
  say "  $dir/$client-list.png     (scroll and search)"
  [[ -z "${MAILBENCH_DESKTOP:-}" ]] && open "$dir/$client-reader.png" "$dir/$client-list.png"; true
}

# ----------------------------------------------------------------- calibrate

calibrate() {
  local out="$RESULTS/calibration.jsonl" delay log
  ensure_unlocked
  session_line calibrate "" >>"$out"
  for delay in 50 200 800; do
    log="$(mktemp)"
    "$CALIBRATE" --delay "$delay" 2>"$log" &
    local cpid=$!
    sleep 2
    say "calibrating at ${delay}ms…"
    "$MEASURE" --app-name calibrate --window-title Calibrate --click 450,350 \
        --runs 10 --label "calibrate/$delay" | tee -a "$out" | grep summary >&2 || true
    kill "$cpid" 2>/dev/null; wait "$cpid" 2>/dev/null || true
    # What the target actually did, so overhead = reported - fired.
    grep '"fired"' "$log" | sed "s/^{/{\"label\":\"calibrate\/$delay\",/" >>"$out"
    rm -f "$log"
  done
  python3 "$HERE/report.py" --calibration "$out"
}

# ---------------------------------------------------------------------- sync
#
# A first sync, timed at the server by the meter rather than by asking the
# client: the same instrument for every client, and one that also reports how
# much of the mailbox the client actually downloaded.

sync_client() {
  local client="$1"
  client_spec "$client"
  local name="$client${TAG:+@$TAG}" out="$RESULTS/$client${TAG:+@$TAG}.jsonl"
  local log="$SERVER_STATE/meter.jsonl"
  pgrep -f "imap_meter.py serve --listen $PORT " >/dev/null \
    || { say "the meter is not running on $PORT: ./mailbench server start (without METER=0)"; exit 1; }
  local corpus_bytes
  corpus_bytes="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("bytes", 0))' "$SERVER_STATE/corpus.json" 2>/dev/null || echo 0)"

  say "== first sync: $client ($CORPUS) =="
  say "  Nothing else should be connected to the server: the meter counts every byte it sends."
  if [[ -n "$PROC" && -n "$(pid_of "$PROC")" ]]; then say "  quitting $client"; quit_client; fi

  if declare -f client_reset >/dev/null; then
    client_reset
    say "  store emptied"
  else
    say "  Empty $client's store for the benchmark account:"
    local step; for step in ${RESET_STEPS[@]+"${RESET_STEPS[@]}"}; do say "    - $step"; done
    (( ${#RESET_STEPS[@]} )) || say "    (clients/$client.json has no reset steps; do whatever gives it an empty store)"
    say "  The clock starts at the first busy second of download, not at Enter, so take your time."
    read -r -p "  Press Enter when ready… " _ </dev/tty
  fi

  local since; since="$(python3 -c 'import time; print(time.time())')"
  session_line "$name" "$(client_version)" >>"$out"
  if declare -f client_reset >/dev/null; then up_client >&2; fi
  say "  waiting for the download to start and finish (30 s of quiet ends it)…"
  local result
  result="$(python3 "$HERE/imap_meter.py" watch --log "$log" --since "$since" \
              --corpus-bytes "$corpus_bytes" --start-timeout 900)" || exit 1
  printf '%s\n' "$result" | python3 -c '
import json, sys
r = json.loads(sys.stdin.read()); r["client"] = sys.argv[1]
print(json.dumps(r))' "$name" >>"$out"
  printf '%s\n' "$result" | python3 -c '
import json, sys
r = json.loads(sys.stdin.read())
ratio = r.get("ratio")
print(f"  {sys.argv[1]}: {r[\"seconds\"]:.0f} s, {r[\"bytes_down\"] / 1e6:,.1f} MB down"
      + (f" ({ratio:.0%} of the corpus)" if ratio is not None else ""))' "$client" >&2
  say "  -> $out"
}

# ------------------------------------------------------------- the rest

permissions() {
  if "$MEASURE" --permissions; then
    say "both granted"
    return 0
  fi
  say "turn on the switch for your terminal in both panes that just opened, then run this again"
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  sleep 1
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
  return 1
}

corpus() {
  local name="${1:-$CORPUS}" dir count
  dir="$BENCH/maildir-$name"
  count="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["corpora"].get(sys.argv[2], {}).get("messages", 0))' "$HERE/corpus.json" "$name")"
  [[ "$count" -gt 0 ]] || { say "no published corpus called $name (try 50k or 250k)"; exit 2; }
  if [[ -d "$dir/cur" ]]; then
    python3 "$HERE/generate_corpus.py" --verify "$dir" >/dev/null
  else
    say "generating the $name corpus into ${dir}…"
    python3 "$HERE/generate_corpus.py" --count "$count" --out "$dir" >/dev/null
    say "serve it with: ${name:+CORPUS=$name }./mailbench server start"
  fi
}

list_clients() {
  local c
  printf '%-12s %-14s %-11s %s\n' client name layout status >&2
  for c in $(all_clients); do
    client_spec "$c"
    local state
    if [[ -n "$PROC" && -n "$(pid_of "$PROC")" ]]; then state="running"
    elif [[ -n "$APP_PATH" && -e "$APP_PATH" ]]; then state="installed ($(client_version))"
    else state="not installed"; fi
    printf '%-12s %-14s %-11s %s\n' "$c" "$CLIENT_NAME" "$LAYOUT_STATUS" "$state" >&2
  done
}

install_client() {
  client_spec "$1"
  if declare -f client_install >/dev/null; then client_install; else say "${INSTALL_TEXT:-no install steps in clients/$1.json}"; fi
}

account_client() {
  client_spec "$1"
  if declare -f client_account >/dev/null; then client_account; return; fi
  say "Add the benchmark account to $CLIENT_NAME:"
  say "  server 127.0.0.1, port $PORT, no encryption, user bench@example.com, password bench"
  local step
  for step in ${ACCOUNT_STEPS[@]+"${ACCOUNT_STEPS[@]}"} ${PARITY_STEPS[@]+"${PARITY_STEPS[@]}"}; do say "  - $step"; done
}

doctor() {
  local ok="  ok" no="  --"
  say "machine   $(sysctl -n machdep.cpu.brand_string) ($(sysctl -n hw.model)), macOS $(sw_vers -productVersion), $(power_source) power"
  say "display   $(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/UI Looks like/ {print $2; exit}')"
  say "results   $RESULTS"
  say ""
  local name
  for name in 50k 250k; do
    if [[ -d "$BENCH/maildir-$name/cur" ]]; then say "$ok corpus $name at $BENCH/maildir-$name"
    elif [[ "$name" == 50k ]]; then say "$no corpus: ./mailbench corpus 50k"; fi
  done
  command -v dovecot >/dev/null && say "$ok dovecot $(dovecot --version | cut -d' ' -f1)" \
    || say "$no dovecot: brew install dovecot"
  CORPUS="$CORPUS" "$HERE/server.sh" status >/dev/null 2>&1 && say "$ok server running ($CORPUS on 127.0.0.1:$PORT)" \
    || say "$no server: ${CORPUS:+CORPUS=$CORPUS }./mailbench server start"
  if [[ -f "$SERVER_STATE/corpus.json" ]]; then
    python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("verified") else 1)' "$SERVER_STATE/corpus.json" \
      && say "$ok the served corpus matches the published digest" \
      || say "$no the served corpus is NOT the published one: ./mailbench corpus $CORPUS"
  fi
  command -v swiftc >/dev/null && say "$ok swiftc" || say "$no swiftc: xcode-select --install"
  [[ -s "$RESULTS/calibration.jsonl" ]] && say "$ok calibrated on this machine" \
    || say "$no not calibrated here: ./mailbench calibrate"
  if [[ -x "$MEASURE" ]] && "$MEASURE" --list >/dev/null 2>&1; then
    say "$ok screen recording permission"
  else
    say "$no screen recording: ./mailbench permissions"
  fi
  say "     (accessibility, for posting clicks and keys, is not checkable from here — ./mailbench permissions asks for both)"
  say ""
  list_clients
}

# ------------------------------------------------------------- over ssh
#
# Nothing started over SSH can capture the screen or post input: it is outside
# the desktop's login session, and macOS attributes its permission requests to
# sshd rather than to anything a person can grant them to. So from an SSH
# session, the commands that touch the screen re-run themselves in Terminal.app
# on the Mac's own display — which is where Screen Recording and Accessibility
# get granted — and the output streams back here.

in_desktop() {
  local dir; dir="$(mktemp -d)"
  {
    echo '#!/bin/bash'
    # Terminal does not pass a locale to a .command script, and without UTF-8
    # bash reads the bytes of a `…` after `$var` as part of the variable name.
    echo 'export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8'
    printf 'cd %q\n' "$PWD"
    printf 'export MAILBENCH_DESKTOP=1 MAILBENCH_HOME=%q RUNS=%q SEARCH_TERM=%q APP=%q TAG=%q CORPUS=%q ACTIONS=%q\n' \
      "$BENCH" "$RUNS" "$SEARCH_TERM" "${APP:-}" "${TAG:-}" "$CORPUS" "${ACTIONS:-}"
    # Holds the display awake for the run: a display that sleeps mid-run locks
    # the screen, and a locked screen measures nothing.
    printf 'caffeinate -di '; printf '%q ' "$0" "$@"; printf '> %q 2>&1\n' "$dir/out"
    printf 'echo $? > %q\n' "$dir/status"
    # Close this window once done; the output already went to ssh.
    echo 'osascript -e "tell application \"Terminal\" to close (every window whose name contains \"run.command\")" >/dev/null 2>&1 &'
  } >"$dir/run.command"
  chmod +x "$dir/run.command"
  : >"$dir/out"
  say "(over ssh: running in Terminal on this Mac's display)"
  open -a Terminal "$dir/run.command"
  tail -n +1 -f "$dir/out" &
  local tailer=$!
  while [[ ! -f "$dir/status" ]]; do sleep 1; done
  sleep 1; kill "$tailer" 2>/dev/null; wait "$tailer" 2>/dev/null || true
  local status; status="$(cat "$dir/status")"
  rm -rf "$dir"
  return "$status"
}

if [[ -n "${SSH_CONNECTION:-}" && -z "${MAILBENCH_DESKTOP:-}" ]]; then
  case "${1:-}" in
    calibrate|snapshot|launch|run|permissions|account|up)
      in_desktop "$@"; exit $? ;;
  esac
fi

# --------------------------------------------------------------------- main

case "${1:-}" in
  doctor|clients|corpus|server|report|submit|install|account|up|sync|validate|""|help|-h|--help) ;;
  *) ensure_tools ;;
esac

case "${1:-}" in
  doctor) command -v swiftc >/dev/null && ensure_tools; doctor ;;
  permissions) permissions ;;
  corpus) corpus "${2:-}" ;;
  server) shift; CORPUS="$CORPUS" exec "$HERE/server.sh" "$@" ;;
  calibrate) calibrate ;;
  clients) list_clients ;;
  install) install_client "${2:?which client}" ;;
  account) account_client "${2:?which client}" ;;
  up) client_spec "${2:?which client}"; up_client ;;
  snapshot) snapshot "${2:?which client}" ;;
  sync) sync_client "${2:?which client}" ;;
  launch)
    # Launch and quit only, into the client's results as a session of its own.
    shift
    for c in "$@"; do
      client_spec "$c"; target_args
      [[ -n "$BUNDLE" ]] || { say "$c has no bundle id; launch is not measured for it"; continue; }
      name="$c${TAG:+@$TAG}"
      ensure_unlocked
      session_line "$name" "$(client_version)" >>"$RESULTS/$name.jsonl"
      launch_cycle "$c" "$name" | tee -a "$RESULTS/$name.jsonl" | grep summary >&2 || true
    done ;;
  report) shift; python3 "$HERE/report.py" "$RESULTS" "$@" ;;
  submit) shift; python3 "$HERE/submit.py" "$RESULTS" "$@" ;;
  validate) shift; python3 "$HERE/validate.py" "$@" ;;
  run)
    shift
    [[ $# -gt 0 ]] || { say "which clients? ./mailbench run <client>... (or all)"; exit 2; }
    if [[ "$1" == all ]]; then set -- $(all_clients); fi
    for c in "$@"; do measure_client "$c" || true; done
    python3 "$HERE/report.py" "$RESULTS" ;;
  *)
    sed -n '2,41p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2 ;;
esac
