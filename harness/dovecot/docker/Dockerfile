# Dovecot, built rather than pulled.
#
# The upstream `dovecot/dovecot` images are amd64 only, and this benchmark runs
# on Apple silicon. Under Rosetta the server crashes on startup
# (`mmap_anonymous_rw mmap failed`), and even if it did not, an emulated IMAP
# server is the wrong thing to have in the middle of a measurement of how fast
# clients are — every number would carry a share of the emulator.
#
# Alpine's package is the same 2.3 series the upstream image ships, so the
# configuration in `dovecot.conf` is unchanged.

FROM alpine:3.21

RUN apk add --no-cache dovecot dovecot-pigeonhole-plugin \
    && adduser -D -u 1000 -h /srv/mail bench 2>/dev/null || true

EXPOSE 143

# `-F` keeps it in the foreground, which is what Docker wants to supervise.
CMD ["dovecot", "-F"]
