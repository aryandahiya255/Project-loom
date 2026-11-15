import unittest

from database import _normalize_database_url


class DatabaseUrlTests(unittest.TestCase):
    def test_legacy_render_postgres_url_uses_psycopg_driver(self):
        self.assertEqual(
            _normalize_database_url("postgres://user:pass@host:5432/loom"),
            "postgresql+psycopg://user:pass@host:5432/loom",
        )

    def test_postgresql_url_uses_psycopg_driver(self):
        self.assertEqual(
            _normalize_database_url("postgresql://user:pass@host:5432/loom"),
            "postgresql+psycopg://user:pass@host:5432/loom",
        )

    def test_non_postgresql_url_is_unchanged(self):
        self.assertEqual(_normalize_database_url("sqlite:///loom.db"), "sqlite:///loom.db")

    def test_missing_database_url_remains_unconfigured(self):
        self.assertIsNone(_normalize_database_url(None))


if __name__ == "__main__":
    unittest.main()
