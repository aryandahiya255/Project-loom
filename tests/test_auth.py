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

    def register_user(self, email="student@example.edu", phone_number=None):
        payload = {
            "name": "Taylor Student",
            "email": email,
            "password": "correct-horse-battery",
            "college_name": "Example University",
            "target_role": "Full-Stack Developer",
            "github_url": "https://github.com/taylor",
        }
        if phone_number is not None:
            payload["phone_number"] = phone_number
        return self.client.post("/api/auth/register", json=payload)

    def register_recruiter(self, email="recruiter@example.com"):
        return self.client.post(
            "/api/auth/recruiter/register",
            json={
                "name": "Riley Recruiter",
                "company_name": "Example Corp",
                "company_website_url": "https://example.com",
                "company_logo_url": "https://example.com/logo.png",
                "work_email": email,
                "password": "recruiter-password",
                "designation": "Talent Partner",
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
                {
                    "hashed_password",
                    "college_name",
                    "phone_number",
                    "target_role",
                }.issubset(column_names)
            )
        finally:
            migration_engine.dispose()

    def test_startup_migration_adds_company_website_to_existing_recruiters(self):
        migration_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            with migration_engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE recruiters ("
                        "id INTEGER PRIMARY KEY, "
                        "name VARCHAR(120) NOT NULL, "
                        "company_name VARCHAR(160) NOT NULL, "
                        "work_email VARCHAR(254) NOT NULL, "
                        "hashed_password VARCHAR(255) NOT NULL, "
                        "designation VARCHAR(120) NOT NULL, "
                        "verified_company_domain BOOLEAN NOT NULL, "
                        "created_at DATETIME NOT NULL)"
                    )
                )

            with patch.object(main, "engine", migration_engine):
                main._migrate_recruiter_profile_columns()

            column_names = {
                column["name"] for column in inspect(migration_engine).get_columns("recruiters")
            }
            self.assertIn("company_website_url", column_names)
        finally:
            migration_engine.dispose()

    def test_recruiter_registration_login_and_role_isolation(self):
        registration = self.register_recruiter()
        self.assertEqual(registration.status_code, 201)
        registration_token = registration.json()["access_token"]
        claims = jwt.decode(registration_token, JWT_SECRET, algorithms=["HS256"])
        self.assertEqual(claims["role"], "recruiter")

        with self.session_factory() as db:
            recruiter = db.scalar(
                select(main.Recruiter).where(
                    main.Recruiter.work_email == "recruiter@example.com"
                )
            )
            self.assertIsNotNone(recruiter)
            self.assertFalse(recruiter.verified_company_domain)
            self.assertNotEqual(recruiter.hashed_password, "recruiter-password")
            self.assertTrue(
                main.PASSWORD_HASHER.verify("recruiter-password", recruiter.hashed_password)
            )

        login = self.client.post(
            "/api/auth/recruiter/login",
            json={
                "work_email": "RECRUITER@example.com",
                "password": "recruiter-password",
            },
        )
        self.assertEqual(login.status_code, 200)
        login_claims = jwt.decode(
            login.json()["access_token"],
            JWT_SECRET,
            algorithms=["HS256"],
        )
        self.assertEqual(login_claims["role"], "recruiter")
        self.assertEqual(
            self.client.post(
                "/api/auth/recruiter/login",
                json={
                    "work_email": "recruiter@example.com",
                    "password": "wrong-password",
                },
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {registration_token}"},
            ).status_code,
            403,
        )
        recruiter_profile = self.client.get(
            "/api/auth/recruiter/me",
            headers={"Authorization": f"Bearer {registration_token}"},
        )
        self.assertEqual(recruiter_profile.status_code, 200)
        self.assertEqual(recruiter_profile.json()["company_website_url"], "https://example.com")

        self.assertEqual(self.register_user().status_code, 201)
        candidate_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "student@example.edu",
                "password": "correct-horse-battery",
            },
        )
        self.assertEqual(candidate_login.status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/recruiter/invite",
                headers={
                    "Authorization": f"Bearer {candidate_login.json()['access_token']}"
                },
                json={
                    "candidate_id": 1,
                    "job_title": "Engineer",
                    "message": "Let's talk.",
                },
            ).status_code,
            403,
        )

    def test_invitation_contact_is_revealed_only_after_candidate_accepts(self):
        self.assertEqual(
            self.register_user(phone_number="+1 555 0100").status_code,
            201,
        )
        candidate_login = self.client.post(
            "/api/auth/login",
            json={
                "email": "student@example.edu",
                "password": "correct-horse-battery",
            },
        )
        candidate_headers = {
            "Authorization": f"Bearer {candidate_login.json()['access_token']}"
        }
        recruiter_registration = self.register_recruiter()
        recruiter_headers = {
            "Authorization": f"Bearer {recruiter_registration.json()['access_token']}"
        }

        public_candidate = self.client.get("/candidates").json()[0]
        api_candidate = self.client.get("/api/candidates?blind=false").json()[0]
        self.assertNotIn("email", public_candidate)
        self.assertNotIn("email", api_candidate)

        invitation_response = self.client.post(
            "/api/recruiter/invite",
            headers=recruiter_headers,
            json={
                "candidate_id": 1,
                "job_title": "Full-Stack Developer",
                "message": "We would like to discuss an opportunity.",
            },
        )
        self.assertEqual(invitation_response.status_code, 201)
        invitation = invitation_response.json()
        invitation_id = invitation["id"]
        self.assertEqual(invitation["status"], "pending")
        self.assertEqual(invitation["recruiter"]["company_name"], "Example Corp")
        self.assertNotIn("hashed_password", invitation["recruiter"])

        incoming = self.client.get(
            "/api/candidate/invitations",
            headers=candidate_headers,
        )
        self.assertEqual(incoming.status_code, 200)
        self.assertEqual(incoming.json()[0]["id"], invitation_id)
        self.assertEqual(
            incoming.json()[0]["recruiter"]["work_email"],
            None,
        )
        self.assertEqual(
            incoming.json()[0]["recruiter"]["company_website_url"],
            "https://example.com",
        )
        contact_url = f"/api/recruiter/invitations/{invitation_id}/contact"
        self.assertEqual(
            self.client.get(contact_url, headers=recruiter_headers).status_code,
            409,
        )

        accepted = self.client.post(
            f"/api/candidate/invitations/{invitation_id}/respond",
            headers=candidate_headers,
            json={"status": "accepted"},
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["status"], "accepted")
        accepted_incoming = self.client.get(
            "/api/candidate/invitations",
            headers=candidate_headers,
        )
        self.assertEqual(
            accepted_incoming.json()[0]["recruiter"]["work_email"],
            "recruiter@example.com",
        )
        contact = self.client.get(contact_url, headers=recruiter_headers)
        self.assertEqual(contact.status_code, 200)
        self.assertEqual(
            contact.json(),
            {
                "candidate_id": 1,
                "name": "Taylor Student",
                "email": "student@example.edu",
                "phone_number": "+1 555 0100",
            },
        )

        another_recruiter = self.register_recruiter("another@example.com")
        self.assertEqual(another_recruiter.status_code, 201)
        self.assertEqual(
            self.client.get(
                contact_url,
                headers={
                    "Authorization": f"Bearer {another_recruiter.json()['access_token']}"
                },
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                "/api/candidate/invitations",
                headers=recruiter_headers,
            ).status_code,
            403,
        )

        declined_invitation = self.client.post(
            "/api/recruiter/invite",
            headers=recruiter_headers,
            json={
                "candidate_id": 1,
                "job_title": "Another role",
                "message": "A second opportunity.",
            },
        ).json()
        declined = self.client.post(
            f"/api/candidate/invitations/{declined_invitation['id']}/respond",
            headers=candidate_headers,
            json={"status": "declined"},
        )
        self.assertEqual(declined.status_code, 200)
        self.assertEqual(declined.json()["status"], "declined")
        self.assertEqual(
            self.client.get(
                f"/api/recruiter/invitations/{declined_invitation['id']}/contact",
                headers=recruiter_headers,
            ).status_code,
            409,
        )


if __name__ == "__main__":
    unittest.main()
