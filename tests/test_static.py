import functools
import http.client
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from scripts.build_static import ROOT, STATIC_MODE, build_site


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class StaticBuildTests(unittest.TestCase):
    def test_public_build_serves_assets_under_repository_subpath(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "family-trip-planner"
            count = build_site(output)
            self.assertEqual(count, len([p for p in output.rglob("*") if p.is_file()]))
            self.assertIn(STATIC_MODE, (output / "index.html").read_text(encoding="utf-8"))
            handler = functools.partial(QuietHandler, directory=directory)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = http.client.HTTPConnection(*server.server_address)
                for path in output.rglob("*"):
                    if not path.is_file():
                        continue
                    relative = path.relative_to(output).as_posix()
                    connection.request("GET", "/family-trip-planner/" + relative)
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200, relative)
                    self.assertEqual(response.read(), path.read_bytes(), relative)
                connection.close()
            finally:
                server.shutdown()
                thread.join()
                server.server_close()

    def make_repository(self, directory):
        root = Path(directory) / "repository"
        shutil.copytree(ROOT / "web", root / "web")
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "add", "web"], cwd=root, check=True)
        return root

    def test_untracked_uploads_and_runtime_files_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.make_repository(directory)
            (root / "web/assets/private-photo.png").write_bytes(b"untracked user image")
            (root / "web/notes.txt").write_text("private draft", encoding="utf-8")
            (root / ".runtime").mkdir()
            (root / ".runtime/trips.sqlite3").write_bytes(b"local data")
            output = Path(directory) / "site"
            build_site(output, root)
            self.assertFalse((output / "assets/private-photo.png").exists())
            self.assertFalse((output / "notes.txt").exists())
            self.assertFalse((output / ".runtime").exists())

    def test_unexpected_tracked_asset_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.make_repository(directory)
            (root / "web/assets/local.sqlite3").write_bytes(b"local data")
            subprocess.run(["git", "add", "web/assets/local.sqlite3"], cwd=root, check=True)
            with self.assertRaisesRegex(ValueError, "Unexpected public asset"):
                build_site(Path(directory) / "site", root)

    def test_builder_refuses_source_and_existing_output(self):
        with self.assertRaisesRegex(ValueError, "separate"):
            build_site(ROOT / "web")
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "keep.txt").write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "empty"):
                build_site(directory)
            self.assertTrue((Path(directory) / "keep.txt").exists())
