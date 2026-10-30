#!/usr/bin/env python3
"""An SMTP server that accepts everything and keeps nothing.

    python3 harness/smtp_sink.py [port]      # default 10025, loopback only

Some clients will not finish adding an account until the outgoing server
answers: Airmail checks SMTP after IMAP and gives up on a refused connection.
The benchmark never sends mail, so this only has to say yes — to EHLO, to
AUTH PLAIN and LOGIN with any password, to MAIL, RCPT and DATA — and then
drop whatever it was given. Nothing leaves the machine.
"""

from __future__ import annotations

import asyncio
import sys


async def session(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    def send(line: str) -> None:
        writer.write((line + "\r\n").encode())

    send("220 localhost bench SMTP sink")
    await writer.drain()
    try:
        while line := await reader.readline():
            command = line.decode(errors="replace").strip()
            verb = command.split(" ", 1)[0].upper()
            if verb in ("EHLO", "HELO"):
                send("250-localhost")
                send("250-AUTH PLAIN LOGIN")
                send("250-8BITMIME")
                send("250 SIZE 104857600")
            elif verb == "AUTH":
                parts = command.split()
                mechanism = parts[1].upper() if len(parts) > 1 else ""
                if mechanism == "PLAIN" and len(parts) == 2:
                    send("334 ")
                    await writer.drain()
                    await reader.readline()
                elif mechanism == "LOGIN":
                    for prompt in ("VXNlcm5hbWU6", "UGFzc3dvcmQ6"):  # Username:, Password:
                        if prompt == "VXNlcm5hbWU6" and len(parts) > 2:
                            continue
                        send(f"334 {prompt}")
                        await writer.drain()
                        await reader.readline()
                send("235 2.7.0 Authentication successful")
            elif verb == "DATA":
                send("354 End data with <CR><LF>.<CR><LF>")
                await writer.drain()
                while (body := await reader.readline()) and body not in (b".\r\n", b".\n"):
                    pass
                send("250 2.0.0 Discarded")
            elif verb == "QUIT":
                send("221 2.0.0 Bye")
                await writer.drain()
                break
            elif verb in ("MAIL", "RCPT", "RSET", "NOOP"):
                send("250 2.0.0 OK")
            else:
                send("502 5.5.2 Not implemented")
            await writer.drain()
    finally:
        writer.close()


async def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 10025
    server = await asyncio.start_server(session, "127.0.0.1", port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
