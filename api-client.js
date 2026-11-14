const isLocalDevelopment =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = (
  window.LOOM_API_BASE_URL ||
  (isLocalDevelopment
    ? "http://localhost:8000/api"
    : "https://loom-api.onrender.com/api")
).replace(/\/+$/, "");
const STUDENT_CANDIDATE_ID = Number(document.body.dataset.candidateId || "1");

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const body = options.body !== undefined && !isFormData && typeof options.body !== "string"
    ? JSON.stringify(options.body)
    : options.body;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body
  });
  const responseText = await response.text();
  let responseData = null;

  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
  }

  if (!response.ok) {
    const detail = responseData && typeof responseData === "object"
      ? responseData.detail
      : null;
    throw new Error(detail || `API request failed with status ${response.status}.`);
  }

  return responseData;
}

window.loomApi = Object.freeze({
  baseUrl: API_BASE_URL,
  candidateId: STUDENT_CANDIDATE_ID,
  request: apiRequest
});
