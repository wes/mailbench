#!/usr/bin/env python3
"""Writes the benchmark mailbox: a deterministic Maildir every client syncs.

The point of this file is corpus parity. A benchmark that compares one client
at 250,000 messages against another at whatever happens to be in someone's
inbox is not a benchmark, so every client reads the *same* mailbox: this one,
served over IMAP by `harness/server.sh`.

Same mailbox means the same bytes. Given a count, a seed and an epoch, the
output is identical on every machine — every message, every file name, every
mtime — and `--verify` checks a Maildir against the digests published in
`harness/corpus.json`. A result is only comparable with another if their
corpus digests match.

    python3 harness/generate_corpus.py --count 50000 --out ~/mailbench/maildir-50k
    python3 harness/generate_corpus.py --verify ~/mailbench/maildir-50k

Messages are written newest first, so the first 50,000 messages of the
250,000 corpus are the 50,000 corpus.

Deliberate limits, both of which are noted in the results:

* **Attachments are named, not carried.** Twelve percent of the corpus claims
  an attachment in a header, but no payload is attached. Real payloads at this
  message count would be tens of gigabytes and would turn the benchmark into a
  measurement of disk throughput.
* **One account.** Adding two IMAP accounts to every client by hand is twice the
  setup for a distinction none of the measurements depend on.

Where the vocabulary came from: this generator started inside Spool's
repository, drawing on that app's demo corpus. It is frozen here and owes
nothing to any client now; changing it is a new corpus version (see
`CORPUS_VERSION`), never an edit to this one.
"""

from __future__ import annotations

import argparse
import base64
import email.utils
import hashlib
import json
import os
import sys
import time
from pathlib import Path

MASK64 = (1 << 64) - 1

# Bumped whenever a byte of output changes for the same arguments. Results
# record it, and two results from different versions are different mailboxes.
CORPUS_VERSION = "mailbench-v1"

# The newest message's Date. Fixed, not `now`: a corpus dated from the moment
# it was generated is a different corpus every time, and could not be checked
# against a published digest. 2026-10-01T00:00:00Z.
DEFAULT_EPOCH = 1790812800


class Rng:
    """xorshift64*, seeded with 0x5EED by default.

    A small, fully specified generator rather than `random`, whose algorithm
    Python is free to change between versions. The corpus has to be the same
    on every Python that runs this.
    """

    def __init__(self, seed: int) -> None:
        self.s = (seed | 1) & MASK64

    def next(self) -> int:
        s = self.s
        s ^= s >> 12
        s &= MASK64
        s ^= (s << 25) & MASK64
        s ^= s >> 27
        self.s = s
        return (s * 0x2545F4914F6CDD1D) & MASK64

    def below(self, n: int) -> int:
        return self.next() % n

    def pick(self, items):
        return items[self.below(len(items))]

    def chance(self, percent: int) -> bool:
        return self.next() % 100 < percent


# ---------------------------------------------------------------- vocabulary
# Part of the corpus definition. Any change here is a new CORPUS_VERSION.

FIRST_NAMES = ["Ana", "Bo", "Carmen", "Dev", "Elif", "Farouk", "Greta", "Hana", "Ivan", "Jo",
               "Kwame", "Lena", "Mira", "Nils", "Omar", "Priya", "Quinn", "Rosa", "Sami",
               "Tomas", "Uma", "Vera", "Wes", "Xiu", "Yara", "Zane"]

LAST_NAMES = ["Alvarez", "Bergman", "Chen", "Dubois", "Egan", "Fischer", "Gupta", "Haddad",
              "Ivanova", "Jensen", "Kowalski", "Lindqvist", "Moreau", "Nakamura", "Okafor",
              "Petrov", "Quintero", "Rossi", "Silva", "Takahashi", "Ueda", "Vargas", "Weber",
              "Yilmaz", "Zhang"]

DOMAINS = ["example.com", "corp.example", "mail.example", "lists.example.org",
           "notify.example.net", "team.example.io"]

SUBJECT_HEADS = ["Q3 planning", "Design review", "Deploy window", "Invoice", "Standup notes",
                 "Contract", "Roadmap", "Postmortem", "Hiring loop", "Budget", "Security audit",
                 "Migration", "Customer escalation", "Board update", "Release", "Retro",
                 "Onboarding", "Renewal", "Performance regression", "API deprecation",
                 "Data request", "Offsite", "Pricing", "Support handoff", "Compliance"]

SUBJECT_TAILS = ["for next week", "— needs your sign-off", "(draft)", "follow-up",
                 "before Friday", "v2", "questions", "final", "revisited", "blocked",
                 "thoughts?", "recap", "action items"]

SENTENCES = [
    "Circling back on this before it slips another week.",
    "I pushed the branch and left two comments inline.",
    "The numbers moved about four percent after the change.",
    "Can you take a look when you get a moment?",
    "Attaching the latest version; the second half is new.",
    "We should decide by Thursday or it lands in the next cycle.",
    "Short version: it works, but the migration path is ugly.",
    "I disagree on the timeline, and here is why.",
    "Confirmed with the vendor this morning.",
    "No action needed, just keeping you in the loop.",
    "Let me know if you would rather discuss live.",
    "The staging environment is back up.",
    "This is the third time we have hit the same edge case.",
    "Ballpark is two weeks, assuming nothing else lands on us.",
    "Approved on my side.",
]

CLOSERS = ["Thanks,", "Best,", "Cheers,", "Talk soon,", "—"]

ATTACHMENT_NAMES = ["report.pdf", "notes.md", "budget.xlsx", "mock.png", "patch.diff"]

# The folders and their weights, out of 100. The name is the IMAP path;
# Maildir++ writes it as a dot-prefixed directory with `/` as `.`.
FOLDERS = [
    ("INBOX", 60),
    ("Sent", 15),
    ("Archive", 15),
    ("Lists/rust", 5),
    ("Junk", 3),
    ("Trash", 2),
    # Empty, and last so it never changes which folder a message lands in:
    # every real account has one, and Canary stops at a dialog asking for it
    # when there is none.
    ("Drafts", 0),
]

# The account's owner: the address the benchmark account logs in as, so a
# client that works out which mail is "to me" gets the same answer as the rest.
ME = ("Bench User", "bench@example.com")

# A 16x16 PNG, so the HTML third of the corpus carries a real inline part and
# every client has to decode something rather than skip a cid it cannot find.
LOGO_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKUlEQVR42mNgGF5AP//1/xev3v0n"
    "ROM0gBjN+vmv/4+6YNQFeF0wNAEAZCY57jRJergAAAAASUVORK5CYII="
)


def maildir_path(root: Path, folder: str) -> Path:
    """Maildir++: INBOX is the root, everything else is a dotted sibling."""
    if folder == "INBOX":
        return root
    return root / ("." + folder.replace("/", "."))


def random_address(rng: Rng) -> tuple[str, str]:
    first = rng.pick(FIRST_NAMES)
    last = rng.pick(LAST_NAMES)
    domain = rng.pick(DOMAINS)
    return (f"{first} {last}", f"{first.lower()}.{last.lower()}@{domain}")


def body_text(rng: Rng, from_name: str, subject: str) -> str:
    out = ["Hi,\n\n"]
    for _ in range(2 + rng.below(4)):
        out.append(rng.pick(SENTENCES))
        out.append(" ")
    out.append("\n\n")

    if rng.chance(30):
        out.append("A few things:\n")
        for i in range(2 + rng.below(3)):
            out.append(f"- {rng.pick(SENTENCES)} ({i + 1})\n")
        out.append("\n")

    if rng.chance(25):
        slug = subject.lower().replace(" ", "-")
        out.append(f"More detail: https://example.com/docs/{slug}\n\n")

    out.append(rng.pick(CLOSERS))
    out.append("\n")
    out.append(from_name)

    if rng.chance(35):
        out.append("\n\nOn an earlier day, someone wrote:\n")
        for _ in range(1 + rng.below(3)):
            out.append(f"> {rng.pick(SENTENCES)}\n")

    return "".join(out)


def rich_body(rng: Rng, subject: str) -> str:
    """The three shapes HTML mail actually turns up in: a receipt, a newsletter,
    and a reply someone wrote in a rich-text editor."""
    shape = rng.below(3)

    if shape == 0:
        total = 20 + rng.below(400)
        shipping = rng.below(12)
        order = 1000 + rng.below(9000)
        return (
            "<html><body>"
            "<table><tr><td>"
            '<img src="cid:mailbench-logo" width="16" height="16" alt="Logo">'
            f"<h2>{subject}</h2>"
            "<p>Thanks for your order. Here is what you paid for.</p>"
            "<table>"
            "<tr><th>Item</th><th>Qty</th><th>Price</th></tr>"
            f"<tr><td>Widget</td><td>2</td><td>${total}.00</td></tr>"
            f"<tr><td>Shipping</td><td>&mdash;</td><td>${shipping}.00</td></tr>"
            f"<tr><td><b>Total</b></td><td></td><td><b>${total + shipping}.00</b></td></tr>"
            "</table>"
            f'<p><a href="https://example.com/orders/{order}">View your order</a></p>'
            "</td></tr></table>"
            '<img src="https://tracker.example.com/open.gif" width="1" height="1">'
            "</body></html>"
        )

    if shape == 1:
        return (
            "<html><body>"
            '<table width="100%"><tr><td>'
            "<table><tr><td>"
            '<img src="https://cdn.example.com/hero.png" width="600" height="200" '
            'alt="This week at Example">'
            f"<h1>{subject}</h1>"
            f"<p>{rng.pick(SENTENCES)}</p>"
            f"<p>{rng.pick(SENTENCES)}</p>"
            '<p><a href="https://example.com/read">Read the rest</a></p>'
            "</td></tr></table>"
            "</td></tr></table>"
            "</body></html>"
        )

    return (
        "<html><body>"
        f"<p>{rng.pick(SENTENCES)}</p>"
        f"<blockquote><p>{rng.pick(SENTENCES)}</p></blockquote>"
        f"<p>{rng.pick(SENTENCES)}</p>"
        '<p><span style="color:#4aa865;font-weight:bold">RESOLVED</span> '
        "&mdash; nothing further needed.</p>"
        "</body></html>"
    )


def build_message(rng: Rng, seq: int, folder: str, threads: list) -> tuple[str, str, str, str]:
    """Returns (rfc822, maildir_flags, message_id, subject)."""
    from_name, from_addr = random_address(rng)
    outgoing = folder == "Sent"

    reply = None
    if threads and rng.chance(32):
        reply = threads[rng.below(len(threads))]

    if reply is not None:
        parent_id, parent_subject = reply
        subject = "Re: " + parent_subject[4:] if parent_subject.startswith("Re: ") else "Re: " + parent_subject
        in_reply_to, references = parent_id, parent_id
    else:
        subject = f"{rng.pick(SUBJECT_HEADS)} {rng.pick(SUBJECT_TAILS)}"
        in_reply_to = references = ""

    message_id = f"<{seq:08x}.{rng.next() & 0xFFFFFFFF:08x}@example.com>"
    plain = body_text(rng, from_name, subject)

    # Flags. Older mail has mostly been read; the newest is what is still
    # unread, capped short of certainty so even the archive holds stragglers.
    flags = ""
    seen_chance = min(58 + min(rng.below(31), 30), 88)
    if outgoing or rng.chance(seen_chance):
        flags += "S"
    if rng.chance(6):
        flags += "F"
    if reply is not None and rng.chance(40):
        flags += "R"

    has_attachment = rng.chance(12)
    attachment = rng.pick(ATTACHMENT_NAMES) if has_attachment else None

    html = rich_body(rng, subject) if rng.below(3) == 0 else ""

    return _assemble(
        seq=seq,
        from_pair=(ME if outgoing else (from_name, from_addr)),
        to_pair=((from_name, from_addr) if outgoing else ME),
        subject=subject,
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references,
        plain=plain,
        html=html,
        attachment=attachment,
    ), "".join(sorted(flags)), message_id, subject


def _assemble(*, seq, from_pair, to_pair, subject, message_id, in_reply_to,
              references, plain, html, attachment) -> str:
    """Hand-rolled RFC822 rather than `email.message`.

    At a quarter of a million messages the stdlib's generator is the slowest
    thing in the run by a wide margin, and every message here is built from the
    same three shapes — so the parts that would need escaping are ones this
    file wrote in the first place.
    """
    boundary = f"=_mailbench_{seq:08x}"
    inner = f"=_mailbench_alt_{seq:08x}"

    headers = [
        f"From: {_addr(from_pair)}",
        f"To: {_addr(to_pair)}",
        f"Subject: {subject}",
        f"Message-ID: {message_id}",
        "MIME-Version: 1.0",
    ]
    if in_reply_to:
        headers.append(f"In-Reply-To: {in_reply_to}")
        headers.append(f"References: {references}")
    if attachment:
        headers.append(f"X-Mailbench-Attachment: {attachment}")

    if not html:
        headers.append('Content-Type: text/plain; charset="utf-8"')
        headers.append("Content-Transfer-Encoding: 8bit")
        return "\r\n".join(headers) + "\r\n\r\n" + _crlf(plain)

    # multipart/related wrapping multipart/alternative, so the inline logo is
    # reachable by cid the way it is in real mail that carries one.
    headers.append(
        f'Content-Type: multipart/related; boundary="{boundary}"; type="multipart/alternative"'
    )
    logo = base64.b64encode(LOGO_PNG).decode("ascii")

    return "\r\n".join(headers) + "\r\n\r\n" + "\r\n".join([
        f"--{boundary}",
        f'Content-Type: multipart/alternative; boundary="{inner}"',
        "",
        f"--{inner}",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        _crlf(plain),
        f"--{inner}",
        'Content-Type: text/html; charset="utf-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        html,
        f"--{inner}--",
        "",
        f"--{boundary}",
        "Content-Type: image/png",
        "Content-Transfer-Encoding: base64",
        "Content-ID: <mailbench-logo>",
        "Content-Disposition: inline",
        "",
        logo,
        f"--{boundary}--",
        "",
    ])


def _addr(pair) -> str:
    name, addr = pair
    return f"{name} <{addr}>"


def _crlf(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\n", "\r\n")


def corpus_name(count: int) -> str:
    """`50k` for 50,000: the name results and ports are filed under."""
    return f"{count // 1000}k" if count % 1000 == 0 else str(count)


def digest(root: Path) -> dict:
    """What makes two Maildirs the same mailbox, as one hash.

    Every message file's folder, its name up to the flags, and a hash of its
    bytes. The flags are left out because the server rewrites them: a client
    that marks a message read renames its file from `:2,` to `:2,S`, and the
    mailbox is still the one that was generated. Dovecot's own files (uidlist,
    indexes, `subscriptions`) are left out for the same reason.
    """
    total = hashlib.sha256()
    count = 0
    size = 0
    for folder, _ in FOLDERS:
        cur = maildir_path(root, folder) / "cur"
        if not cur.is_dir():
            continue
        for path in sorted(cur.iterdir(), key=lambda p: p.name.split(":2,")[0]):
            data = path.read_bytes()
            base = path.name.split(":2,")[0]
            total.update(f"{folder}\t{base}\t{hashlib.sha256(data).hexdigest()}\n".encode())
            count += 1
            size += len(data)
    return {"digest": "sha256:" + total.hexdigest(), "messages": count, "bytes": size}


def generate(root: Path, count: int, seed: int, epoch: int) -> None:
    for folder, _ in FOLDERS:
        for sub in ("cur", "new", "tmp"):
            (maildir_path(root, folder) / sub).mkdir(parents=True, exist_ok=True)

    # Every folder subscribed. Apple Mail and MailMate list whatever exists;
    # Thunderbird lists only what is subscribed, and without this sees an
    # inbox and nothing else — then syncs a fifth of what the others sync.
    # Dovecot's own format: a version line, a blank, then one name per line
    # with the hierarchy separator written as a tab.
    parents = {f.rsplit("/", 1)[0] for f, _ in FOLDERS if "/" in f}
    names = [f for f, _ in FOLDERS] + sorted(parents)
    (root / "subscriptions").write_text(
        "V\t2\n\n" + "".join(n.replace("/", "\t") + "\n" for n in names)
    )

    rng = Rng(seed)
    total_weight = sum(w for _, w in FOLDERS)
    threads: list[tuple[str, str]] = []

    timestamp = epoch
    written = 0
    started = time.time()

    for seq in range(count):
        # Messages arrive in bursts during the day and go quiet at night; even
        # spacing makes the date column look obviously synthetic.
        timestamp -= rng.below(900) + 30

        pick = rng.below(total_weight)
        folder = FOLDERS[0][0]
        for name, weight in FOLDERS:
            if pick < weight:
                folder = name
                break
            pick -= weight

        raw, flags, message_id, subject = build_message(rng, seq, folder, threads)

        # `+0000`, not the `-0000` formatdate writes, which RFC 5322 reserves
        # for "the zone is unknown".
        date = email.utils.formatdate(timestamp, localtime=False).replace("-0000", "+0000")
        raw = raw.replace("MIME-Version: 1.0", f"Date: {date}\r\nMIME-Version: 1.0", 1)
        payload = raw.encode("utf-8")

        if len(threads) < 4096 and not subject.startswith("Re: "):
            threads.append((message_id, subject))

        # Maildir wants a name unique to the delivering host and process; this
        # one is unique by sequence number instead, so the same corpus has the
        # same file names wherever it is generated.
        name = f"{timestamp}.M{seq}.mailbench,S={len(payload)}:2,{flags}"
        # Everything lands in `cur`: `new` means "the server has not told
        # anyone about this yet", and a corpus that starts there would have
        # every client racing to file a quarter of a million messages on the
        # first connection.
        path = maildir_path(root, folder) / "cur" / name
        path.write_bytes(payload)
        # Dovecot takes a Maildir message's INTERNALDATE (its received date)
        # from the file's mtime. Left at the moment of writing, every message
        # would have arrived in the same few seconds while its Date header
        # says otherwise — and a client sorting on one and showing the other
        # would be measuring that bug.
        os.utime(path, (timestamp, timestamp))

        written += 1
        if written % 10_000 == 0:
            rate = written / (time.time() - started)
            print(f"  {written:>8,} / {count:,}  ({rate:,.0f}/s)", file=sys.stderr, flush=True)


def published(name: str) -> dict | None:
    registry = Path(__file__).with_name("corpus.json")
    if not registry.exists():
        return None
    data = json.loads(registry.read_text())
    if data.get("version") != CORPUS_VERSION:
        return None
    return data.get("corpora", {}).get(name)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=50_000)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--seed", type=lambda s: int(s, 0), default=0x5EED)
    ap.add_argument("--epoch", type=int, default=DEFAULT_EPOCH,
                    help="Unix time of the newest message (default: the published corpus's)")
    ap.add_argument("--verify", type=Path, metavar="MAILDIR",
                    help="check a Maildir against the published digest, and print its description")
    args = ap.parse_args()

    if args.verify:
        root = args.verify.expanduser()
        found = digest(root)
        name = corpus_name(found["messages"])
        expected = published(name)
        info = {"version": CORPUS_VERSION, "name": name, **found}
        if expected and expected["digest"] == found["digest"]:
            info["verified"] = True
            print(json.dumps(info))
            print(f"{root}: the published {name} corpus ({CORPUS_VERSION}), {found['messages']:,} messages",
                  file=sys.stderr)
            return 0
        info["verified"] = False
        print(json.dumps(info))
        if expected:
            print(f"{root}: {found['messages']:,} messages, but NOT the published {name} corpus.\n"
                  f"  expected {expected['digest']}\n  found    {found['digest']}\n"
                  f"Regenerate it before measuring anything you mean to publish.", file=sys.stderr)
        else:
            print(f"{root}: {found['messages']:,} messages; no published corpus of that size to check against",
                  file=sys.stderr)
        return 1

    if not args.out:
        ap.error("--out is required (or --verify)")
    root: Path = args.out.expanduser()
    if root.exists() and any(root.iterdir()):
        print(f"{root} is not empty. Remove it first.", file=sys.stderr)
        return 1

    started = time.time()
    generate(root, args.count, args.seed, args.epoch)
    elapsed = time.time() - started
    found = digest(root)
    name = corpus_name(args.count)

    print(f"\nwrote {found['messages']:,} messages to {root}", file=sys.stderr)
    print(f"      {found['bytes'] / 1e6:,.1f} MB in {elapsed:.1f}s", file=sys.stderr)
    for folder, _ in FOLDERS:
        n = len(list((maildir_path(root, folder) / "cur").iterdir()))
        print(f"      {folder:<12} {n:>8,}", file=sys.stderr)
    print(f"      {found['digest']}", file=sys.stderr)

    expected = published(name)
    standard = args.seed == 0x5EED and args.epoch == DEFAULT_EPOCH
    if expected and standard and expected["digest"] != found["digest"]:
        print(f"\nThis does not match the published {name} corpus ({expected['digest']}).\n"
              "Something about this machine changes the output; please open an issue.", file=sys.stderr)
        return 1
    print(json.dumps({"version": CORPUS_VERSION, "name": name, "seed": args.seed, "epoch": args.epoch,
                      "verified": bool(expected and expected["digest"] == found["digest"]), **found}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
