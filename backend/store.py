"""Local SQLite store. Capability tokens are hashed and never written in clear."""

import hashlib
import hmac
import json
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL)")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, draft):
        trip_id, token = secrets.token_hex(12), secrets.token_urlsafe(32)
        state = {"draft": draft, "plan": None, "version": 0, "events": []}
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.connect() as db:
            db.execute("INSERT INTO trips VALUES (?, ?, ?, ?)", (trip_id, digest, 1, json.dumps(state, ensure_ascii=False)))
        return {"id": trip_id, "token": token, "revision": 1, **state}

    def read(self, trip_id, token):
        with self.connect() as db:
            row = db.execute("SELECT token_hash, revision, state FROM trips WHERE id = ?", (trip_id,)).fetchone()
        if not row or not isinstance(token, str) or not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
            raise PermissionError("trip not found or token invalid")
        return {"id": trip_id, "revision": row[1], **json.loads(row[2])}

    def mutate(self, trip_id, token, expected_revision, update):
        if type(expected_revision) is not int:
            raise ValueError("expected_revision is required")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT token_hash, revision, state FROM trips WHERE id = ?", (trip_id,)).fetchone()
            if not row or not isinstance(token, str) or not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
                raise PermissionError("trip not found or token invalid")
            if row[1] != expected_revision:
                raise RuntimeError("revision conflict; reload the trip")
            state = update(json.loads(row[2]))
            revision = row[1] + 1
            db.execute("UPDATE trips SET revision = ?, state = ? WHERE id = ?", (revision, json.dumps(state, ensure_ascii=False), trip_id))
        return {"id": trip_id, "revision": revision, **state}

    def delete(self, trip_id, token):
        self.read(trip_id, token)
        with self.connect() as db:
            db.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
