# Apple Mail's hooks. Sourced by harness/run.sh after the client's JSON is
# loaded, with BENCH, PROFILE, PORT and APP_PATH set.

# Mail's own scripting interface can create an IMAP account, which saves the
# hand-filled sheet. The first run asks once for permission to control Mail.
client_account() {
  osascript - "$PORT" <<'OSA'
on run argv
  set p to (item 1 of argv) as integer
  tell application "Mail"
    if (count of (every account whose name is "Bench")) > 0 then return "Bench account already exists"
    set acct to make new imap account with properties {name:"Bench", user name:"bench@example.com", password:"bench", server name:"127.0.0.1", port:p, uses ssl:false, email addresses:{"bench@example.com"}, full name:"Bench User"}
    set enabled of acct to true
    return "Bench account created; Mail is syncing it now"
  end tell
end run
OSA
}

# Where Apple Mail keeps the *benchmark* account, and nothing else.
#
# `~/Library/Mail` is every account on the machine. Measuring the lot and
# calling it Apple Mail's footprint for the corpus would be wrong, in every
# other client's favour. Mail keeps one directory per account under
# `V*/<uuid>/`, named by mailbox; `Lists.mbox` comes from `Lists/rust` in the
# generated corpus and marks the benchmark account.
#
# `MailData/` (the Envelope Index) is shared across accounts and cannot be
# attributed, so the figure excludes it. The client's caveats say so.
client_store() {
  local dir
  for dir in "$HOME"/Library/Mail/V*/*/; do
    [[ -d "$dir/Lists.mbox" ]] && { printf '%s' "$dir"; return 0; }
  done
  return 1
}
