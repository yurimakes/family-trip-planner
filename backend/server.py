"""Dependency-free development server. Bind to loopback for local examples."""

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .service import Service
from .store import Store

ROOT = Path(__file__).resolve().parents[1]
ERROR_STATUS = {PermissionError: 404, RuntimeError: 409, LookupError: 404, ValueError: 422}


def handler_for(service):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

        def log_message(self, *_):
            pass

        def end_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def send_json(self, status, body):
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def api(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 65536:
                    self.send_json(413, {"error": "request body exceeds 64 KiB"})
                    return
                body = json.loads(self.rfile.read(size)) if size else None
                if body is not None and not isinstance(body, dict):
                    raise ValueError("request body must be an object")
                result = service.handle(self.command, urlsplit(self.path).path, body, self.headers.get("X-Trip-Token"))
                self.send_json(200, result)
            except (PermissionError, RuntimeError, LookupError, ValueError) as error:
                self.send_json(ERROR_STATUS.get(type(error), 422), {"error": error.args[0] if error.args else "invalid request"})

        def do_GET(self):
            if urlsplit(self.path).path.startswith("/api/"):
                self.api()
            else:
                if urlsplit(self.path).path.endswith("/") and urlsplit(self.path).path != "/":
                    self.send_error(404)
                    return
                super().do_GET()

        do_POST = api
        do_PUT = api
        do_DELETE = api

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Run the family trip local prototype")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--database", default=str(ROOT / ".runtime" / "trips.sqlite3"))
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(Service(Store(args.database))))
    print(f"Family trip prototype: http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
