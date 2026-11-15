const isLocalDevelopment =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = (
  window.LOOM_API_BASE_URL ||
  (isLocalDevelopment
    ? "http://localhost:8000/api"
    : "https://loom-api-vgo6.onrender.com/api")
).replace(/\/+$/, "");
const ACCESS_TOKEN_KEY = "loom_access_token";
const CANDIDATE_ID_KEY = "loom_candidate_id";
let studentCandidateId = Number(
  sessionStorage.getItem(CANDIDATE_ID_KEY) || document.body.dataset.candidateId || "1"
);

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
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

function setAccessToken(accessToken) {
  if (accessToken) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

function setCandidateId(candidateId) {
  if (!Number.isSafeInteger(candidateId) || candidateId < 1) {
    throw new Error("Candidate ID must be a positive integer.");
  }
  studentCandidateId = candidateId;
  sessionStorage.setItem(CANDIDATE_ID_KEY, String(candidateId));
}

window.loomApi = Object.freeze({
  baseUrl: API_BASE_URL,
  get candidateId() {
    return studentCandidateId;
  },
  request: apiRequest,
  setAccessToken,
  setCandidateId
});
