"""Optional ASGI adapter using the same tested service and planner."""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .server import ERROR_STATUS
from .service import Service
from .store import Store

ROOT = Path(__file__).resolve().parents[1]
app = FastAPI(title="Family Trip Planner", version="0.1.0")


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def api(path: str, request: Request):
    raw = await request.body()
    if len(raw) > 65536:
        return JSONResponse({"error": "request body exceeds 64 KiB"}, status_code=413)
    try:
        import json

        payload = json.loads(raw) if raw else None
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("request body must be an object")
        service = Service(Store(os.environ.get("TRIP_DATABASE_PATH", str(ROOT / ".runtime" / "trips.sqlite3"))))
        result = service.handle(request.method, "/api/" + path, payload, request.headers.get("X-Trip-Token"))
        return JSONResponse(result, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
    except (PermissionError, RuntimeError, LookupError, ValueError) as error:
        return JSONResponse({"error": error.args[0] if error.args else "invalid request"}, status_code=ERROR_STATUS.get(type(error), 422))


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
