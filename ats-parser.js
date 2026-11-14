async function analyzeResume(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new TypeError("Provide non-empty resume text to analyze.");
  }

  return window.loomApi.request("/parse-resume", {
    method: "POST",
    body: { resume_text: text }
  });
}

async function requestResumeFileAnalysis(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const endpoint = /\.pdf$/i.test(file.name)
    ? "/parse-resume-file"
    : "/parse-resume";
  return window.loomApi.request(endpoint, {
    method: "POST",
    body: formData
  });
}

let atsScoreChart = null;
let skillMatchChart = null;

function renderSkillGapChart(analysis, container, skillCatalog) {
  if (!container) {
    throw new TypeError("A chart container is required.");
  }
  if (typeof window.Chart !== "function") {
    throw new Error("Chart.js did not load. Check your connection and try again.");
  }
  if (atsScoreChart) {
    atsScoreChart.destroy();
  }
  if (skillMatchChart) {
    skillMatchChart.destroy();
  }

  const foundSkills = new Set(analysis.found_skills.map((skill) => skill.trim().toLowerCase()));
  const missingSkills = new Set(analysis.missing_skills.map((skill) => skill.trim().toLowerCase()));
  const matched = skillCatalog.map((skill) => {
    const name = skill.name.trim().toLowerCase();
    return foundSkills.has(name) && !missingSkills.has(name);
  });

  const chart = document.createElement("div");
  chart.className = "chart-content";

  const summary = document.createElement("div");
  summary.className = "ats-summary";
  const score = document.createElement("strong");
  score.className = "ats-score";
  score.textContent = `${analysis.ats_score}%`;
  const summaryText = document.createElement("p");
  summaryText.textContent = "Full-Stack Developer ATS score";
  summary.append(score, summaryText);
  chart.append(summary);

  const chartPanels = document.createElement("div");
  chartPanels.className = "chart-panels";

  const scorePanel = document.createElement("figure");
  scorePanel.className = "chart-panel";
  const scoreHeading = document.createElement("figcaption");
  scoreHeading.textContent = "ATS score out of 100";
  const scoreCanvas = document.createElement("canvas");
  scoreCanvas.setAttribute("role", "img");
  scoreCanvas.setAttribute("aria-label", `ATS score: ${analysis.ats_score} out of 100`);
  const scoreCanvasContainer = document.createElement("div");
  scoreCanvasContainer.className = "score-chart-container";
  scoreCanvasContainer.append(scoreCanvas);
  scorePanel.append(scoreHeading, scoreCanvasContainer);

  const skillsPanel = document.createElement("figure");
  skillsPanel.className = "chart-panel";
  const skillsHeading = document.createElement("figcaption");
  skillsHeading.textContent = "Skills versus Full-Stack Developer requirements";
  const skillsCanvas = document.createElement("canvas");
  skillsCanvas.setAttribute("role", "img");
  skillsCanvas.setAttribute(
    "aria-label",
    "Horizontal comparison of matching skills in green and missing skills in red"
  );
  const skillsCanvasContainer = document.createElement("div");
  skillsCanvasContainer.className = "skills-chart-container";
  skillsCanvasContainer.style.height = `${Math.max(260, skillCatalog.length * 28)}px`;
  skillsCanvasContainer.append(skillsCanvas);
  skillsPanel.append(skillsHeading, skillsCanvasContainer);

  chartPanels.append(scorePanel, skillsPanel);
  chart.append(chartPanels);

  const feedbackHeading = document.createElement("h3");
  feedbackHeading.className = "feedback-heading";
  feedbackHeading.textContent = "Formatting feedback";
  const feedback = document.createElement("p");
  feedback.className = "ats-feedback";
  feedback.textContent = analysis.formatting_feedback;

  const disclaimer = document.createElement("p");
  disclaimer.className = "ats-disclaimer";
  disclaimer.textContent = "AI-generated feedback is a guide, not a hiring decision. Confirm all claims are accurate.";
  chart.append(feedbackHeading, feedback, disclaimer);
  container.replaceChildren(chart);

  const rootStyles = getComputedStyle(document.documentElement);
  const matchedColor = rootStyles.getPropertyValue("--color-green").trim() || "#315d4b";
  const missingColor = "#b84d4d";
  const chartGridColor = rootStyles.getPropertyValue("--color-line").trim() || "#e3e8e3";

  atsScoreChart = new window.Chart(scoreCanvas, {
    type: "doughnut",
    data: {
      labels: ["ATS score", "Points remaining"],
      datasets: [{
        data: [analysis.ats_score, 100 - analysis.ats_score],
        backgroundColor: [matchedColor, chartGridColor],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.raw}%`
          }
        }
      }
    }
  });

  skillMatchChart = new window.Chart(skillsCanvas, {
    type: "bar",
    data: {
      labels: skillCatalog.map((skill) => skill.name),
      datasets: [
        {
          label: "Matched",
          data: matched.map((isMatched) => isMatched ? 1 : 0),
          backgroundColor: matchedColor,
          stack: "skill-status"
        },
        {
          label: "Missing",
          data: matched.map((isMatched) => isMatched ? 0 : 1),
          backgroundColor: missingColor,
          stack: "skill-status"
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0,
          max: 1,
          stacked: true,
          ticks: {
            display: false
          },
          grid: {
            display: false
          },
          border: {
            display: false
          }
        },
        y: {
          stacked: true,
          grid: {
            display: false
          },
          border: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.label}`
          }
        }
      }
    }
  });

}

const analysisForm = document.querySelector("#resume-analysis-form");
const resumeText = document.querySelector("#resume-text");
const analysisMessage = document.querySelector("#analysis-message");
const chartContainer = document.querySelector("#skill-gap-chart");
const analysisJson = document.querySelector("#analysis-json");

async function renderAnalysisResult(result) {
  const skillCatalog = await window.loomApi.request("/skills");
  if (!Array.isArray(skillCatalog) || skillCatalog.some((item) => (
    !item || typeof item.name !== "string" || typeof item.category !== "string"
  ))) {
    throw new Error("The skill catalog API returned an invalid response.");
  }
  renderSkillGapChart(result, chartContainer, skillCatalog);
  analysisJson.textContent = JSON.stringify(result, null, 2);
}

analysisForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  analysisMessage.classList.remove("is-error");
  analysisMessage.textContent = "Sending resume text to the local ATS API...";

  try {
    const result = await analyzeResume(resumeText.value);
    await renderAnalysisResult(result);
    analysisMessage.textContent = "Analysis complete.";
  } catch (error) {
    analysisMessage.textContent = error instanceof Error ? error.message : "Could not analyze resume text.";
    analysisMessage.classList.add("is-error");
  }
});

window.analyzeResumeFile = async (file) => {
  analysisMessage.classList.remove("is-error");
  analysisMessage.textContent = "Uploading resume file to the local ATS API...";
  try {
    const result = await requestResumeFileAnalysis(file);
    await renderAnalysisResult(result);
    analysisMessage.textContent = "Analysis complete.";
    return true;
  } catch (error) {
    analysisMessage.textContent = error instanceof Error ? error.message : "Could not analyze the resume file.";
    analysisMessage.classList.add("is-error");
    return false;
  }
};

window.analyzeResumeText = analyzeResume;
