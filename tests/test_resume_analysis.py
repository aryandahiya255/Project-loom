import unittest

import main


class ResumeAnalysisSchemaTests(unittest.TestCase):
    def test_response_schema_omits_unsupported_additional_properties(self):
        schema = main.ResumeATSResponse.model_json_schema()

        self.assertNotIn("additionalProperties", schema)


if __name__ == "__main__":
    unittest.main()
