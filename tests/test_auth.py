from datetime import datetime, timedelta, timezone
import os
import unittest
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main


JWT_SECRET = "test-secret-key-with-at-least-thirty-two-characters"


class AuthenticationEndpointTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"JWT_SECRET_KEY": JWT_SECRET})
        self.environment.start()
        self.application_engine = patch.object(main, "engine", None)
        self.application_engine.start()
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        main.Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )

        def override_get_db():
            with self.session_factory() as db:
                yield db

        main.app.dependency_overrides[main.get_db] = override_get_db
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.pop(main.get_db, None)
        self.engine.dispose()
        self.application_engine.stop()
        self.environment.stop()

    def register_user(self, email="student@example.edu"):
        return self.client.post(
            "/api/auth/register",
            json={
                "name": "Taylor Student",
                "email": email,
                "password": "correct-horse-battery",
                "college_name": "Example University",
                "target_role": "Full-Stack Developer",
                "github_url": "https://github.com/taylor",
            },
        )

    def test_register_hashes_password_and_returns_profile(self):
        response = self.register_user()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["name"], "Taylor Student")
        self.assertEqual(response.json()["college_name"], "Example University")
        self.assertEqual(response.json()["target_role"], "Full-Stack Developer")
        self.assertNotIn("hashed_password", response.json())
        self.assertNotIn("password", response.json())

        with self.session_factory() as db:
            candidate = db.scalar(
                select(main.Candidate).where(main.Candidate.email == "student@example.edu")
            )
            self.assertIsNotNone(candidate)
            self.assertNotEqual(candidate.hashed_password, "correct-horse-battery")
            self.assertTrue(
                main.PASSWORD_HASHER.verify(
                    "correct-horse-battery",
                    candidate.hashed_password,
                )
            )

    def test_login_returns_bearer_token_for_protected_profile(self):
        self.assertEqual(self.register_user().status_code, 201)
        invalid_login = self.client.post(
            "/api/auth/login",
            json={"email": "student@example.edu", "password": "wrong-password"},
        )
        self.assertEqual(invalid_login.status_code, 401)

        login = self.client.post(
            "/api/auth/login",
            json={"email": "STUDENT@example.edu", "password": "correct-horse-battery"},
        )
        self.assertEqual(login.status_code, 200)
        token_response = login.json()
        self.assertEqual(token_response["token_type"], "bearer")

        profile = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token_response['access_token']}"},
        )
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["email"], "student@example.edu")
        self.assertEqual(profile.json()["college_name"], "Example University")
        self.assertNotIn("hashed_password", profile.json())

    def test_registration_rejects_duplicate_email_and_short_password(self):
        self.assertEqual(self.register_user("Student@example.edu").status_code, 201)
        duplicate = self.register_user("student@example.edu")
        self.assertEqual(duplicate.status_code, 409)

        short_password = self.client.post(
            "/api/auth/register",
            json={
                "name": "Another Student",
                "email": "another@example.edu",
                "password": "short",
                "college_name": "Example University",
                "target_role": "Developer",
                "github_url": "https://github.com/another",
            },
        )
        self.assertEqual(short_password.status_code, 422)

    def test_me_requires_valid_unexpired_bearer_token(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(
            self.client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer not-a-jwt"},
            ).status_code,
            401,
        )

        expired_token = jwt.encode(
            {
                "sub": "1",
                "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        self.assertEqual(response.status_code, 401)

    def test_api_health_checks_database_connectivity(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "connected"})

    def test_startup_migration_adds_new_fields_to_existing_table(self):
        migration_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            with migration_engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE candidates ("
                        "id INTEGER PRIMARY KEY, "
                        "name VARCHAR(120) NOT NULL, "
                        "email VARCHAR(254) NOT NULL)"
                    )
                )

            with patch.object(main, "engine", migration_engine):
                main._migrate_candidate_auth_columns()

            column_names = {
                column["name"] for column in inspect(migration_engine).get_columns("candidates")
            }
            self.assertTrue(
                {"hashed_password", "college_name", "target_role"}.issubset(column_names)
            )
        finally:
            migration_engine.dispose()


if __name__ == "__main__":
    unittest.main()
