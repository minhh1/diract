#!/usr/bin/env python3
# Minimal HTTP wrapper around the LibreOffice CLI already bundled in the
# gotenberg/gotenberg base image, for the one thing Gotenberg's own HTTP API
# doesn't do: converting a legacy .doc into a real .docx (Gotenberg only
# ever outputs PDF). POST raw file bytes to /convert with header
# X-Filename: <original name with its real extension, e.g. input.doc> and
# get back the converted .docx bytes.
#
# Runs one soffice conversion at a time (headless LibreOffice doesn't handle
# concurrent invocations against the same user profile reliably) — fine for
# an admin-only template-upload feature with low, non-concurrent traffic.
import http.server
import os
import shutil
import subprocess
import tempfile
import threading
import uuid

PORT = int(os.environ.get("PORT", "3000"))
CONVERT_LOCK = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._respond(200, b"ok", "text/plain")
            return
        self._respond(404, b"not found", "text/plain")

    def do_POST(self):
        if self.path != "/convert":
            self._respond(404, b"not found", "text/plain")
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            self._respond(400, b"empty body", "text/plain")
            return
        body = self.rfile.read(length)

        original_name = self.headers.get("X-Filename", "input.doc")
        ext = os.path.splitext(original_name)[1] or ".doc"

        workdir = tempfile.mkdtemp(prefix="docconv-")
        try:
            in_path = os.path.join(workdir, f"input{ext}")
            with open(in_path, "wb") as f:
                f.write(body)

            with CONVERT_LOCK:
                result = subprocess.run(
                    [
                        "soffice", "--headless", "--norestore",
                        "--convert-to", "docx:MS Word 2007 XML",
                        "--outdir", workdir, in_path,
                    ],
                    capture_output=True, timeout=60,
                )

            out_path = os.path.join(workdir, "input.docx")
            if result.returncode != 0 or not os.path.exists(out_path):
                detail = (result.stderr or result.stdout or b"").decode("utf-8", "replace")[:500]
                self._respond(502, f"conversion failed: {detail}".encode(), "text/plain")
                return

            with open(out_path, "rb") as f:
                out_bytes = f.read()
            self._respond(
                200, out_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        except subprocess.TimeoutExpired:
            self._respond(504, b"conversion timed out", "text/plain")
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # keep container logs quiet; docker logs still shows stdout if needed


if __name__ == "__main__":
    # Give LibreOffice a fresh, writable user profile dir per container start.
    os.environ.setdefault("HOME", f"/tmp/lo-home-{uuid.uuid4().hex}")
    os.makedirs(os.environ["HOME"], exist_ok=True)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
