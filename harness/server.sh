#!/usr/bin/env bash
# The benchmark IMAP server: Homebrew's Dovecot, run natively as you.
#
#   harness/server.sh start      verify the corpus, start, warm the index, start the meter
#   harness/server.sh stop
#   harness/server.sh status
#   harness/server.sh log
#   harness/server.sh reset      stop and throw away the server's indexes
#
# 127.0.0.1:10143 for the 50k corpus, 10144 for 250k; plain IMAP, user `bench`
# or `bench@example.com`, password `bench`. An SMTP sink on 10025 accepts and
# discards, for clients that will not add an account without one.
#
#   CORPUS=250k harness/server.sh start     the second mailbox, beside the first
#   METER=0 harness/server.sh start         Dovecot on the port directly, no meter
#
# The meter (imap_meter.py) sits on the port the clients use and passes every
# byte through to Dovecot on PORT+1000, counting. It is how first-sync time is
# measured the same way for every client. Without it, `mailbench sync` cannot
# run; everything else can.
#
# The Docker path in harness/dovecot/docker/ still works where Docker is
# installed; this is the one to prefer on a Mac. See dovecot/native.conf.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH="${MAILBENCH_HOME:-$HOME/mailbench}"
CORPUS="${CORPUS:-50k}"
MAILDIR="${MAILDIR:-$BENCH/maildir-$CORPUS}"
# The published corpora have published ports, so a client configured against
# one is configured against it on every machine.
PORT="${PORT:-$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["corpora"].get(sys.argv[2], {}).get("port", 10143))' "$HERE/corpus.json" "$CORPUS")}"
METER="${METER:-1}"
if [[ "$METER" == 1 ]]; then DOVECOT_PORT=$((PORT + 1000)); else DOVECOT_PORT="$PORT"; fi
# One server state per corpus, so a second corpus can be served beside the
# first without either rebuilding the other's indexes.
STATE="$BENCH/server-$CORPUS"
CONF="$STATE/dovecot.conf"

DOVECOT="$(command -v dovecot || echo /opt/homebrew/opt/dovecot/sbin/dovecot)"
DOVEADM="$(command -v doveadm || echo /opt/homebrew/opt/dovecot/bin/doveadm)"

need_dovecot() { [[ -x "$DOVECOT" ]] || { echo "dovecot not found: brew install dovecot" >&2; exit 1; }; }

render() {
  [[ -d "$MAILDIR/cur" ]] || {
    echo "no corpus at $MAILDIR" >&2
    echo "  ./mailbench corpus $CORPUS" >&2
    exit 1
  }
  mkdir -p "$STATE/run" "$STATE/state" "$STATE/index"
  # Both spellings of the one account. Most clients log in with the email
  # address by default; neomutt and doveadm use `bench`. Same mailbox either
  # way — the userdb points every login at one Maildir.
  printf 'bench:{PLAIN}bench::::::\nbench@example.com:{PLAIN}bench::::::\n' >"$STATE/users"
  sed -e "s|@STATE@|$STATE|g" \
      -e "s|@MAILDIR@|$MAILDIR|g" \
      -e "s|@USER@|$(id -un)|g" \
      -e "s|@GROUP@|$(id -gn)|g" \
      -e "s|@UID@|$(id -u)|g" \
      -e "s|@GID@|$(id -g)|g" \
      -e "s|@PORT@|$DOVECOT_PORT|g" \
      "$HERE/dovecot/native.conf" >"$CONF"
}

running() { [[ -f "$CONF" ]] && "$DOVEADM" -c "$CONF" process status >/dev/null 2>&1; }
meter_running() { pgrep -f "imap_meter.py serve --listen $PORT " >/dev/null 2>&1; }

meter_up() {
  [[ "$METER" == 1 ]] || return 0
  meter_running && return 0
  nohup python3 "$HERE/imap_meter.py" serve --listen "$PORT" --upstream "$DOVECOT_PORT" \
      --log "$STATE/meter.jsonl" >>"$STATE/meter.log" 2>&1 &
  sleep 0.5
  meter_running || { echo "the meter did not come up; see $STATE/meter.log" >&2; exit 1; }
}
meter_down() { pkill -f "imap_meter.py serve --listen $PORT " 2>/dev/null || true; }

# The outgoing side: a sink on 10025 that accepts and discards, for clients
# that will not add an account until SMTP answers. One for every corpus.
smtp_up() {
  lsof -nP -iTCP:10025 -sTCP:LISTEN >/dev/null 2>&1 && return 0
  nohup python3 "$HERE/smtp_sink.py" 10025 >"$BENCH/smtp.log" 2>&1 &
}
smtp_down() {
  # Only once no corpus is being served any more.
  pgrep -f "dovecot -c $BENCH/server-" >/dev/null 2>&1 && return 0
  pkill -f "smtp_sink.py 10025" 2>/dev/null || true
}

case "${1:-}" in
  start)
    need_dovecot
    render
    # Which mailbox this is, checked against the published digests and kept
    # beside the server, where the harness reads it into every session line.
    echo "checking the corpus…"
    if python3 "$HERE/generate_corpus.py" --verify "$MAILDIR" >"$STATE/corpus.json"; then :; else
      echo "  (serving it anyway; results from it will say it is not the published corpus)" >&2
    fi
    if running; then
      echo "already running"
    else
      "$DOVECOT" -c "$CONF"
      sleep 1
    fi
    if ! running; then
      echo "dovecot did not come up; the end of its log:" >&2
      tail -5 "$STATE/dovecot.log" >&2
      exit 1
    fi
    # Dovecot builds its index on first access, and whichever client connects
    # first would otherwise pay for it and report it as its own slowness.
    # `doveadm index` is not the tool for that: without an FTS plugin it is a
    # no-op. Reading every header builds the per-mailbox indexes and pulls the
    # whole corpus into the page cache, so every client starts from the same
    # warm server.
    echo "warming the index and the page cache…"
    SECONDS=0
    "$DOVEADM" -c "$CONF" fetch -u bench 'flags size.physical date.received hdr' \
        mailbox '*' all >/dev/null
    echo "  done in ${SECONDS}s"
    meter_up
    smtp_up
    echo "serving $MAILDIR on 127.0.0.1:$PORT (bench / bench)"
    [[ "$METER" == 1 ]] && echo "  through the meter; Dovecot itself on $DOVECOT_PORT"
    echo "  SMTP sink on 10025"
    ;;
  stop)
    meter_down
    [[ -f "$CONF" ]] && "$DOVEADM" -c "$CONF" stop 2>/dev/null || true
    sleep 0.5
    smtp_down
    ;;
  status)
    need_dovecot
    if running; then
      echo "running ($CORPUS on 127.0.0.1:$PORT)"
      if [[ "$METER" == 1 ]]; then
        if meter_running; then echo "meter running ($STATE/meter.jsonl)"; else echo "meter NOT running"; fi
      fi
      "$DOVEADM" -c "$CONF" mailbox status -u bench 'messages' '*'
    else
      echo "stopped"; exit 1
    fi
    ;;
  log)
    tail -f "$STATE/dovecot.log"
    ;;
  reset)
    "$0" stop
    rm -rf "$STATE/index" "$STATE/state"
    echo "indexes removed; the corpus is untouched"
    ;;
  *)
    sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2
    ;;
esac
