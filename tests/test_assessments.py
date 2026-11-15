from datetime import datetime, timezone
import os
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main


JWT_SECRET = "test-assessment-secret-with-at-least-thirty-two-characters"


class RedisSessionStub:
    def __init__(self):
        self.expirations = {}
        self.values = {}

    async def set(self, key, value, ex, nx=False):
        if nx and key in self.expirations:
            return False
        self.values[key] = value
        self.expirations[key] = time.monotonic() + ex
        return True

    async def pttl(self, key):
        expires_at = self.expirations.get(key)
        if expires_at is None:
            return -2
        return max(0, int((expires_at - time.monotonic()) * 1000))

    async def delete(self, key):
        return int(self.expirations.pop(key, None) is not None)


class AssessmentEndpointTests(unittest.TestCase):
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

        self.redis = RedisSessionStub()

        async def override_get_redis():
            yield self.redis

        main.app.dependency_overrides[main.get_db] = override_get_db
        main.app.dependency_overrides[main.get_redis] = override_get_redis
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.token = self.register_and_login("candidate@example.edu")
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.pop(main.get_db, None)
        main.app.dependency_overrides.pop(main.get_redis, None)
        self.engine.dispose()
        self.application_engine.stop()
        self.environment.stop()

    def register_and_login(self, email):
        registration = self.client.post(
            "/api/auth/register",
            json={
                "name": "Assessment Candidate",
                "email": email,
                "password": "assessment-password",
                "college_name": "Example University",
                "target_role": "Backend Developer",
                "github_url": "https://github.com/candidate",
            },
        )
        self.assertEqual(registration.status_code, 201)
        login = self.client.post(
            "/api/auth/login",
            json={"email": email, "password": "assessment-password"},
        )
        self.assertEqual(login.status_code, 200)
        return login.json()["access_token"]

    def test_subjects_have_five_questions_and_start_hides_answers(self):
        subjects = self.client.get("/api/assessments/subjects")
        self.assertEqual(subjects.status_code, 200)
        self.assertGreaterEqual(len(subjects.json()), 4)
        self.assertTrue(all(subject["question_count"] == 5 for subject in subjects.json()))

        response = self.client.post(
            "/api/assessments/start",
            json={"subject_code": "python"},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["questions"]), 5)
        self.assertTrue(
            all("answer" not in question for question in response.json()["questions"])
        )
        self.assertIn(f"quiz_session:1:python", self.redis.expirations)

    def test_submission_is_server_graded_and_saves_verified_subject_score(self):
        started = self.client.post(
            "/api/assessments/start",
            json={"subject_code": "sql"},
            headers=self.headers,
        )
        self.assertEqual(started.status_code, 200)
        correct_answers = [question.answer for question in main.ASSESSMENT_SUBJECTS["sql"].questions]
        correct_answers[0] = 0 if correct_answers[0] != 0 else 1
        response = self.client.post(
            "/api/assessments/submit",
            json={"subject_code": "sql", "answers": correct_answers},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 80)
        self.assertTrue(response.json()["verified_status"])
        self.assertTrue(response.json()["passed"])
        self.assertFalse(response.json()["timed_out"])

        with self.session_factory() as db:
            score = db.scalar(select(main.AssessmentScore))
            self.assertIsNotNone(score)
            self.assertEqual(score.subject_code, "sql")
            self.assertEqual(score.subject_title, "SQL Databases")
            self.assertEqual(score.score, 80)
            self.assertTrue(score.verified_status)

        listed_scores = self.client.get("/api/candidate/scores", headers=self.headers)
        self.assertEqual(listed_scores.status_code, 200)
        self.assertEqual(listed_scores.json()[0]["subject_code"], "sql")
        self.assertEqual(listed_scores.json()[0]["score"], 80)
        self.assertEqual(
            self.client.get("/api/candidate/scores").status_code,
            401,
        )

    def test_candidate_cannot_submit_another_candidates_session(self):
        started = self.client.post(
            "/api/assessments/start",
            json={"subject_code": "dsa"},
            headers=self.headers,
        )
        self.assertEqual(started.status_code, 200)
        other_candidate_token = self.register_and_login("other@example.edu")
        answers = [question.answer for question in main.ASSESSMENT_SUBJECTS["dsa"].questions]
        response = self.client.post(
            "/api/assessments/submit",
            json={"subject_code": "dsa", "answers": answers},
            headers={"Authorization": f"Bearer {other_candidate_token}"},
        )
        self.assertEqual(response.status_code, 409)

    def test_assessment_subject_migration_populates_existing_score_rows(self):
        migration_engine = create_engine("sqlite://")
        with migration_engine.begin() as connection:
            connection.execute(
                text(
                    "CREATE TABLE assessment_scores ("
                    "id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL, "
                    "test_name VARCHAR(160) NOT NULL, score FLOAT NOT NULL, "
                    "verified_status BOOLEAN NOT NULL, completed_at DATETIME NOT NULL)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO assessment_scores "
                    "(id, candidate_id, test_name, score, verified_status, completed_at) "
                    "VALUES (1, 1, 'Legacy assessment', 85, 1, :completed_at)"
                ),
                {"completed_at": datetime.now(timezone.utc)},
            )

        try:
            with patch.object(main, "engine", migration_engine):
                main._migrate_assessment_score_subject_columns()
            columns = {column["name"] for column in inspect(migration_engine).get_columns("assessment_scores")}
            self.assertIn("subject_code", columns)
            self.assertIn("subject_title", columns)
            with migration_engine.connect() as connection:
                score = connection.execute(
                    text("SELECT subject_code, subject_title FROM assessment_scores WHERE id = 1")
                ).one()
            self.assertEqual(score.subject_code, "backend_fundamentals")
            self.assertEqual(score.subject_title, "Backend Fundamentals")
        finally:
            migration_engine.dispose()


if __name__ == "__main__":
    unittest.main()
