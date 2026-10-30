# Clients

One file per mail client: `<id>.json`, checked against
[`../schema/client.schema.json`](../schema/client.schema.json) (editors pick it
up from the `$schema` line). Start from [`_template.json`](_template.json).

The harness measures every client with the same code. A definition tells it
only where things are.

## Fields

| Field | |
|---|---|
| `id` | Lowercase, matches the file name. Used on the command line: `./mailbench run <id>` |
| `name`, `vendor`, `homepage` | As shown on the site |
| `source` | `open` or `closed`: whether the client's own source is public |
| `maintainers` | GitHub handles of whoever keeps this definition right |
| `vendor_maintained` | `true` if a maintainer works on or for the client. Shown with its results |
| `install` | How to install it. Text in backticks is shown as code |
| `app.path` | The `.app` bundle |
| `app.bundle_id` | How the instrument finds the window, and launches and quits the app. Without one (a terminal client), launch and quit are not measured |
| `app.app_name` | For a client with no bundle of its own: the name of the app hosting it (a terminal) |
| `app.process` | Process name, for memory, resizing and quitting (`pgrep -x` must find it) |
| `app.window_title` | A substring of the main window's title, when the client can have more than one window |
| `app.version_command` | Shell that prints the version, for a client without a bundle |
| `launch_env` | Environment to launch with. `{profile}` is `~/mailbench/profiles/<id>-<corpus>`, a directory of the client's own |
| `account` | How to add the benchmark account |
| `parity` | Settings that must change so the client holds the whole mailbox locally. Nothing else may be changed |
| `reset` | How to empty its store, for `./mailbench sync` |
| `store` | Where it keeps the benchmark account, for disk size. `~`, globs and `{profile}` allowed |
| `layout` | Where things are — below |
| `caveats` | What a reader needs to know to read its numbers. With `metric`, shown beside that number; without, on the client's page |

## The layout

Coordinates are **window-relative points**, origin top left, for the
benchmark's **1400 × 900** window — the harness resizes every client's window
to that before measuring.

| Field | |
|---|---|
| `status` | `verified` (checked by snapshot at `verified.version`), `unverified` (never checked), or `missing` (cannot be measured yet) |
| `row` | `[x, y]` of a message row in the list |
| `row_dy` | Distance to a second row. Clicks alternate between the two, so every click lands on a row that is not already selected |
| `reader` | `[x, y, w, h]` of the pane the message body paints into. Not the whole window, which would catch the row highlight instead |
| `list` | `[x, y, w, h]` of the message list, watched for scroll, search and launch |
| `search.field` | `[x, y]` of the search field |
| `search.submit` | `true` if the client searches on Return rather than as you type |
| `search.clear` | Steps that empty the field once it has focus (default `cmd+a,backspace`) |
| `search.leave` | One step that leaves the field: a key (default `escape`) or `click@x:y` |
| `search.prepare` | Replaces click-and-clear before each search, for a field that needs a sequence of its own. Steps are keys, `click@x:y` and `wait@ms` |
| `search.reset` | One step that replaces the whole of clearing the search afterwards |

Keys are written as `return`, `escape`, `backspace`, `down`, `cmd+a`,
`shift+g` and so on.

### Finding them

1. Start the client against the benchmark account and let it sync.
2. Put rough numbers in the definition and run `./mailbench snapshot <id>`. It
   resizes the window, then saves two pictures: the reader rectangle with the
   two row clicks, and the list rectangle with the search click.
3. Adjust until the red box is exactly the pane that changes and the blue
   crosses sit in the middle of message rows and the search field.
4. Set `status` to `verified` with the client's version, your macOS version and
   the month.

Watch out for anything that moves on its own inside a watched rectangle — a
progress bar, a clock, an animated avatar. The instrument cannot tell it from
the change it is timing. Turn it off if the client allows, and say so in
`parity`; otherwise draw the rectangle around it.

## Hooks

If a client needs more than clicks, add `<id>.sh`. `harness/run.sh` sources it
after loading the JSON, with `BENCH`, `PROFILE`, `PORT`, `APP_PATH` and
`LAUNCH_ENV` set, and calls whichever of these it defines:

| Hook | Called by | Default |
|---|---|---|
| `client_install` | `./mailbench install <id>` | prints `install` |
| `client_account` | `./mailbench account <id>` | prints the account settings and `account` steps |
| `client_up` | `./mailbench up <id>`, and after launch-and-quit | `open -a "$APP_PATH"` with `launch_env` |
| `client_reset` | `./mailbench sync <id>` | prints `reset` and waits for Enter |
| `client_store` | every measurement | `store` |
| `client_close_strays` | between tests | nothing |

[`spool.sh`](spool.sh) uses most of them; [`applemail.sh`](applemail.sh) adds
the account through Mail's scripting interface. Every client is started through
Launch Services (`open`), never from its binary, so macOS charges its helper
processes to it.
