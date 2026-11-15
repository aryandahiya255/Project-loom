import unittest
from unittest.mock import patch

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

    def test_invalid_argument_includes_reason_without_api_key(self):
        error = APIError(
            400,
            {
                "error": {
                    "status": "INVALID_ARGUMENT",
                    "message": "Request rejected for key test-secret-value",
                }
            },
        )

        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-secret-value"}):
            detail = main._resume_provider_error_detail(error)

        self.assertIn("Request rejected", detail)
        self.assertNotIn("test-secret-value", detail)


if __name__ == "__main__":
    unittest.main()
