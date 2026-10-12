import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.store import Store


class StoreConnectionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.connections = []
        real_connect = sqlite3.connect

        def capture(*args, **kwargs):
            connection = real_connect(*args, **kwargs)
            self.connections.append(connection)
            return connection

        self.spy = patch('backend.store.sqlite3.connect', side_effect=capture)
        self.spy.start()
        self.store = Store(Path(self.directory.name) / 'trips.sqlite3')

    def tearDown(self):
        self.spy.stop()
        for connection in self.connections:
            connection.close()
        self.directory.cleanup()

    def assert_all_closed(self):
        for connection in self.connections:
            with self.assertRaises(sqlite3.ProgrammingError):
                connection.execute('SELECT 1')

    def test_successful_operations_release_database_handles(self):
        self.assert_all_closed()
        trip = self.store.create({'example': True})
        self.assert_all_closed()
        self.store.read(trip['id'], trip['token'])
        self.assert_all_closed()
        self.store.mutate(trip['id'], trip['token'], 1, lambda state: state)
        self.assert_all_closed()
        self.store.delete(trip['id'], trip['token'])
        self.assert_all_closed()
        self.store.path.unlink()

    def test_failed_operations_close_connections_and_roll_back(self):
        trip = self.store.create({'example': True})
        with self.assertRaises(PermissionError):
            self.store.read(trip['id'], 'wrong')
        with self.assertRaises(RuntimeError):
            self.store.mutate(trip['id'], trip['token'], 9, lambda state: state)
        with self.assertRaises(PermissionError):
            self.store.mutate(trip['id'], 'wrong', 1, lambda state: state)

        def failing_update(state):
            state['draft'] = {'changed': True}
            raise ValueError('update rejected')

        with self.assertRaises(ValueError):
            self.store.mutate(trip['id'], trip['token'], 1, failing_update)
        saved = self.store.read(trip['id'], trip['token'])
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['draft'], {'example': True})
        self.assert_all_closed()
