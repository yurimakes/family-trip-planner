import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from backend.server import handler_for
from backend.service import Service
from backend.store import Store
from helpers import draft


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.directory.name)/"trips.sqlite3")
        self.service = Service(self.store)
        self.trip = self.service.handle("POST","/api/trips",draft())
        self.path = "/api/trips/"+self.trip["id"]
        self.token = self.trip["token"]

    def tearDown(self):
        self.directory.cleanup()

    def confirm(self, revision=1, **extra):
        return self.service.handle("POST",self.path+"/confirm",{"expected_revision":revision,"plan_key":"A","confirmations":{"mom":True,"dad":True},**extra},self.token)

    def test_create_read_and_hash_token(self):
        state = self.service.handle("GET",self.path,token=self.token)
        self.assertNotIn("token",state)
        self.assertNotIn(self.token,Path(self.store.path).read_bytes().decode(errors="ignore"))
        with self.assertRaises(PermissionError):self.service.handle("GET",self.path,token="wrong")

    def test_reopen_persists(self):
        second = Store(self.store.path)
        self.assertEqual(second.read(self.trip["id"],self.token)["draft"],draft())

    def test_confirmation_and_stale_revision(self):
        result = self.confirm()
        self.assertEqual((result["revision"],result["version"]),(2,1))
        with self.assertRaises(RuntimeError):self.confirm()

    def test_server_recomputes_ignoring_client_valid(self):
        d = draft();d["unknown_ids"] = ["fan"]
        self.service.handle("PUT",self.path,{"draft":d,"expected_revision":1},self.token)
        with self.assertRaises(ValueError):self.confirm(2,valid=True)
        self.assertEqual(self.store.read(self.trip["id"],self.token)["revision"],2)

    def test_confirmation_requires_actual_boolean_true(self):
        for value in (False,"true",1):
            with self.assertRaises(ValueError):self.confirm(confirmations={"mom":True,"dad":value})

    def test_draft_change_invalidates_confirmed_plan(self):
        self.confirm()
        result = self.service.handle("PUT",self.path,{"draft":draft(),"expected_revision":2},self.token)
        self.assertIsNone(result["plan"])
        self.assertEqual(result["version"],1)

    def test_change_increments_version_preserving_completed(self):
        self.confirm()
        body = {"expected_revision":2,"completed_ids":["market","rice"],"remaining_walk_limit":300,"continuous_limit":100,"confirmations":{"mom":True,"dad":True}}
        result = self.service.handle("POST",self.path+"/change",body,self.token)
        self.assertEqual((result["revision"],result["version"]),(3,2))
        self.assertTrue(result["plan"]["rows"][0]["completed"])
        body.update(expected_revision=3,completed_ids=["market"])
        with self.assertRaises(ValueError):self.service.handle("POST",self.path+"/change",body,self.token)

    def test_delete_requires_token(self):
        with self.assertRaises(PermissionError):self.service.handle("DELETE",self.path,token="wrong")
        self.service.handle("DELETE",self.path,token=self.token)
        with self.assertRaises(PermissionError):self.store.read(self.trip["id"],self.token)

    def test_request_http_json_and_static_assets(self):
        server = ThreadingHTTPServer(("127.0.0.1",0),handler_for(self.service))
        thread = threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1",server.server_port)
            connection.request("GET","/api/health")
            response = connection.getresponse()
            self.assertEqual(response.status,200)
            self.assertFalse(json.loads(response.read())["ai_connected"])
            connection.request("GET","/")
            response = connection.getresponse();self.assertIn(b"app.js",response.read())
            connection.request("GET",self.path,headers={"X-Trip-Token":self.token})
            response = connection.getresponse();self.assertEqual(response.status,200);self.assertEqual(json.loads(response.read())["revision"],1)
            connection.request("POST","/api/compare",body='[1,2]',headers={"Content-Type":"application/json"})
            response = connection.getresponse();self.assertEqual(response.status,422);response.read()
            connection.request("GET","/assets/")
            response = connection.getresponse();self.assertEqual(response.status,404);response.read()
            connection.request("POST","/api/compare",body=json.dumps(draft()),headers={"Content-Type":"application/json"})
            response = connection.getresponse();self.assertEqual(response.status,200);self.assertTrue(json.loads(response.read())["plans"][1]["valid"])
            connection.close()
        finally:
            server.shutdown();server.server_close();thread.join()


class OptionalFastApiTests(unittest.TestCase):
    def test_adapter_when_dependencies_available(self):
        try:
            from fastapi.testclient import TestClient
            from backend.fastapi_app import app
        except ImportError:
            self.skipTest("optional FastAPI/httpx dependencies are not installed")
        with tempfile.TemporaryDirectory() as directory:
            import os
            from unittest.mock import patch
            with patch.dict(os.environ,{"TRIP_DATABASE_PATH":str(Path(directory)/"trips.sqlite3")}):
                client = TestClient(app)
                self.assertEqual(client.get("/api/health").status_code,200)
                self.assertTrue(client.post("/api/compare",json=draft()).json()["plans"][1]["valid"])
                self.assertEqual(client.post("/api/compare",json=[1]).status_code,422)
