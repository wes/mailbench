# MailMate's hooks. Sourced by harness/run.sh.

# MailMate opens a message in a window of its own now and then (a Return that
# reaches the list). Close any window that is not the main one, so none sits
# over the rows being clicked.
client_close_strays() {
  osascript -e 'tell application "System Events" to tell process "MailMate" to click (button 1 of (every window whose name does not contain "Inbox"))' >/dev/null 2>&1 || true
}
