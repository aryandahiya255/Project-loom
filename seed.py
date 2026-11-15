"""Seed the Loom database with reusable demo candidates, scores, and jobs.

Set DATABASE_URL before running: python seed.py
"""

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from database import Base, engine
from main import AssessmentScore, Candidate, JobPosting


SAMPLE_CANDIDATES = [
    {
        "name": "Dev",
        "email": "dev@example.test",
        "username": "dev",
        "bio": "Backend engineer focused on reliable APIs and data systems.",
        "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
        "repositories": ["loom-api", "task-queue"],
        "score": 96,
    },
    {
        "name": "Aayushi",
        "email": "aayushi@example.test",
        "username": "aayushi",
        "bio": "Full-stack developer building accessible product experiences.",
        "skills": ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL"],
        "repositories": ["portfolio", "team-planner"],
        "score": 92,
    },
    {
        "name": "Aryan",
        "email": "aryan@example.test",
        "username": "aryan",
        "bio": "Software developer with a focus on backend systems and applied AI.",
        "skills": ["Python", "FastAPI", "SQL", "Git", "Gemini"],
        "repositories": ["resume-parser", "api-starter"],
        "score": 88,
    },
    {
        "name": "Tejas",
        "email": "tejas@example.test",
        "username": "tejas",
        "bio": "Backend developer experienced in service design and testing.",
        "skills": ["Java", "Spring Boot", "REST APIs", "PostgreSQL", "Docker"],
        "repositories": ["inventory-service", "test-kit"],
        "score": 84,
    },
    {
        "name": "Lucky",
        "email": "lucky@example.test",
        "username": "lucky",
        "bio": "Developer working across cloud services, data, and web applications.",
        "skills": ["Go", "Redis", "AWS", "React", "REST APIs"],
        "repositories": ["event-service", "cloud-dashboard"],
        "score": 81,
    },
]

SAMPLE_JOB_POSTINGS = [
    {
        "title": "Backend Engineer",
        "required_skills": ["Python", "FastAPI", "PostgreSQL", "REST APIs"],
    },
    {
        "title": "Full-Stack Engineer",
        "required_skills": ["TypeScript", "React", "Node.js", "SQL"],
    },
    {
        "title": "AI Platform Engineer",
        "required_skills": ["Python", "FastAPI", "Redis", "Git", "LLM APIs"],
    },
]


def seed_database() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL must be set before running seed.py.")

    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    created_candidates = 0
    created_scores = 0
    created_jobs = 0

    with session_factory.begin() as session:
        for sample in SAMPLE_CANDIDATES:
            candidate = session.scalar(
                select(Candidate).where(Candidate.email == sample["email"])
            )
            if candidate is None:
                username = sample["username"]
                candidate = Candidate(
                    name=sample["name"],
                    email=sample["email"],
                    github_url=f"https://github.com/{username}",
                    bio=sample["bio"],
                    skills=sample["skills"],
                    github_repos=[
                        f"https://github.com/{username}/{repository}"
                        for repository in sample["repositories"]
                    ],
                )
                session.add(candidate)
                session.flush()
                created_candidates += 1

            existing_score = session.scalar(
                select(AssessmentScore.id).where(
                    AssessmentScore.candidate_id == candidate.id,
                    AssessmentScore.test_name == "REST APIs and database structures",
                    AssessmentScore.verified_status.is_(True),
                )
            )
            if existing_score is None:
                session.add(
                    AssessmentScore(
                        candidate_id=candidate.id,
                        test_name="REST APIs and database structures",
                        score=sample["score"],
                        verified_status=True,
                    )
                )
                created_scores += 1

        for sample in SAMPLE_JOB_POSTINGS:
            existing_job = session.scalar(
                select(JobPosting.id).where(JobPosting.title == sample["title"])
            )
            if existing_job is None:
                session.add(
                    JobPosting(
                        title=sample["title"],
                        required_skills=sample["required_skills"],
                    )
                )
                created_jobs += 1

    print(
        "Seed complete: "
        f"{created_candidates} candidates, "
        f"{created_scores} verified scores, "
        f"{created_jobs} job postings added."
    )
    engine.dispose()


if __name__ == "__main__":
    seed_database()
