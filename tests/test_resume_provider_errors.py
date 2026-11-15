import unittest

from google.genai.errors import APIError

import main


class ResumeProviderErrorTests(unittest.TestCase):
    def test_invalid_api_key_error_is_actionable(self):
        error = APIError(
            400,
            {"error": {"status": "INVALID_ARGUMENT", "message": "API key not valid"}},
        )

        self.assertIn("GEMINI_API_KEY", main._resume_provider_error_detail(error))

    def test_quota_error_identifies_quota(self):
        error = APIError(
            429,
            {"error": {"status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded"}},
        )

        self.assertIn("quota", main._resume_provider_error_detail(error).lower())


if __name__ == "__main__":
    unittest.main()
