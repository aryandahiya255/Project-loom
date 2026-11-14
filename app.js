const githubForm = document.querySelector("#github-form");
const githubInput = document.querySelector("#github-url");
const githubMessage = document.querySelector("#github-message");
const repositoryList = document.querySelector("#repository-list");
const resumeUpload = document.querySelector("#resume-upload");
const resumeInput = document.querySelector("#resume-file");
const resumeFileName = document.querySelector("#resume-file-name");
const resumeMessage = document.querySelector("#resume-message");
const resumeTextInput = document.querySelector("#resume-text");
const resumeAnalysisForm = document.querySelector("#resume-analysis-form");
const skillBadges = document.querySelector(".skill-badges");
const skillCount = document.querySelector("#skill-count");
const profileBadgeMessage = document.querySelector("#profile-badge-message");

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function renderGithubLinks(links) {
  repositoryList.replaceChildren();

  links.forEach((link) => {
    const repositoryUrl = new URL(link);
    if (repositoryUrl.protocol !== "https:" || repositoryUrl.hostname !== "github.com") {
      throw new Error("The candidate profile contains an invalid GitHub repository URL.");
    }

    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = repositoryUrl.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = repositoryUrl.pathname.replace(/^\/|\/$/g, "");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "repository-remove";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${anchor.textContent}`);
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        const query = new URLSearchParams({ github_url: link });
        const profile = await window.loomApi.request(
          `/candidates/${window.loomApi.candidateId}/github-repos?${query}`,
          { method: "DELETE" }
        );
        renderGithubLinks(profile.github_repos);
        showMessage(githubMessage, "Repository removed.");
      } catch (error) {
        removeButton.disabled = false;
        showMessage(
          githubMessage,
          error instanceof Error ? error.message : "Could not remove this repository.",
          true
        );
      }
    });

    item.append(anchor, removeButton);
    repositoryList.append(item);
  });
}

function renderProfileBadges(badges) {
  const hasBackendBadge = badges.some((badge) => badge.name === "Verified Backend");
  if (hasBackendBadge) {
    const alreadyRendered = [...skillBadges.children].some((item) => (
      item.textContent.includes("Verified Backend")
    ));
    if (!alreadyRendered) {
      const badge = document.createElement("li");
      const check = document.createElement("span");
      check.className = "badge-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      const label = document.createElement("span");
      label.textContent = "Verified Backend";
      const level = document.createElement("span");
      level.className = "badge-level";
      level.textContent = "Assessment passed";
      badge.append(check, label, level);
      skillBadges.append(badge);
    }
  }

  skillCount.textContent = `${String(skillBadges.children.length).padStart(2, "0")} skills`;
}

async function loadStudentProfile() {
  try {
    const profile = await window.loomApi.request(
      `/candidates/${window.loomApi.candidateId}/profile`
    );
    if (!Array.isArray(profile.github_repos) || !Array.isArray(profile.badges)) {
      throw new Error("The candidate profile response was invalid.");
    }
    renderGithubLinks(profile.github_repos);
    renderProfileBadges(profile.badges);
    showMessage(githubMessage, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the candidate profile.";
    showMessage(githubMessage, message, true);
    showMessage(profileBadgeMessage, message, true);
  }
}

githubForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(githubMessage, "");

  let repositoryUrl;
  try {
    repositoryUrl = new URL(githubInput.value.trim());
  } catch {
    showMessage(githubMessage, "Enter a valid GitHub repository URL.", true);
    return;
  }

  const pathParts = repositoryUrl.pathname.split("/").filter(Boolean);
  if (
    repositoryUrl.protocol !== "https:"
    || repositoryUrl.hostname !== "github.com"
    || pathParts.length < 2
  ) {
    showMessage(githubMessage, "Use a repository URL like https://github.com/you/project.", true);
    return;
  }

  const normalizedUrl = `https://github.com/${pathParts[0]}/${pathParts[1].replace(/\.git$/i, "")}`;
  const submitButton = githubForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const profile = await window.loomApi.request(
      `/candidates/${window.loomApi.candidateId}/github-repos`,
      { method: "POST", body: { github_url: normalizedUrl } }
    );
    renderGithubLinks(profile.github_repos);
    githubInput.value = "";
    showMessage(githubMessage, "Repository saved.");
  } catch (error) {
    showMessage(
      githubMessage,
      error instanceof Error ? error.message : "Could not save this repository.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

async function handleResumeFile(file) {
  if (!file) {
    return;
  }

  resumeFileName.textContent = file.name;
  showMessage(resumeMessage, "");
  if (/\.pdf$|\.docx$/i.test(file.name)) {
    showMessage(resumeMessage, "Uploading resume for analysis...");
    const analyzed = await window.analyzeResumeFile(file);
    showMessage(
      resumeMessage,
      analyzed ? "Resume analysis complete." : "Could not analyze the uploaded resume.",
      !analyzed
    );
    return;
  }

  if (!/\.txt$/i.test(file.name)) {
    showMessage(
      resumeMessage,
      "Choose a .txt, .pdf, or .docx file."
    );
    return;
  }

  try {
    const text = await file.text();
    if (!text.trim()) {
      throw new Error("The selected text file is empty.");
    }
    resumeTextInput.value = text;
    showMessage(resumeMessage, "Resume text loaded. Starting ATS analysis...");
    resumeAnalysisForm.requestSubmit();
  } catch (error) {
    showMessage(
      resumeMessage,
      error instanceof Error ? error.message : "Could not read the selected text file.",
      true
    );
  }
}

resumeInput.addEventListener("change", () => {
  void handleResumeFile(resumeInput.files[0]);
});

resumeUpload.addEventListener("click", (event) => {
  if (event.target !== resumeInput) {
    resumeInput.click();
  }
});

resumeUpload.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    resumeInput.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  resumeUpload.addEventListener(eventName, (event) => {
    event.preventDefault();
    resumeUpload.classList.add("is-dragging");
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  resumeUpload.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!resumeUpload.contains(event.relatedTarget)) {
      resumeUpload.classList.remove("is-dragging");
    }
  });
});

resumeUpload.addEventListener("drop", (event) => {
  event.preventDefault();
  resumeUpload.classList.remove("is-dragging");
  void handleResumeFile(event.dataTransfer.files[0]);
});

void loadStudentProfile();
