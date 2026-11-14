window.loomCandidates = [
  {
    name: "Candidate 01",
    verifiedAssessmentScores: [
      { assessment: "Backend fundamentals", score: 92, verified: true },
      { assessment: "API design", score: 88, verified: true }
    ],
    techStack: ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
    githubRepoStats: { repositories: 12, stars: 184, forks: 37 },
    codeSnippet: "async def get_project(project_id: int, db: Session):\n    return await projects.find_one(db, project_id)"
  },
  {
    name: "Candidate 02",
    verifiedAssessmentScores: [
      { assessment: "Backend fundamentals", score: 96, verified: true },
      { assessment: "API design", score: 91, verified: true }
    ],
    techStack: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "React"],
    githubRepoStats: { repositories: 9, stars: 263, forks: 42 },
    codeSnippet: "export async function listOrders(accountId: string) {\n  return orderStore.findMany({ accountId, status: 'open' });\n}"
  },
  {
    name: "Candidate 03",
    verifiedAssessmentScores: [
      { assessment: "Backend fundamentals", score: 84, verified: true },
      { assessment: "API design", score: 86, verified: true }
    ],
    techStack: ["Java", "Spring Boot", "MySQL", "Kafka", "Kubernetes"],
    githubRepoStats: { repositories: 15, stars: 127, forks: 24 },
    codeSnippet: "@GetMapping(\"/v1/inventory/{sku}\")\npublic InventoryItem getItem(@PathVariable String sku) {\n    return inventoryService.findBySku(sku);\n}"
  },
  {
    name: "Candidate 04",
    verifiedAssessmentScores: [
      { assessment: "Backend fundamentals", score: 89, verified: true },
      { assessment: "API design", score: 94, verified: true }
    ],
    techStack: ["Python", "Django", "PostgreSQL", "Celery", "Redis"],
    githubRepoStats: { repositories: 7, stars: 311, forks: 58 },
    codeSnippet: "class BookingViewSet(ModelViewSet):\n    queryset = Booking.objects.select_related('venue')\n    serializer_class = BookingSerializer"
  },
  {
    name: "Candidate 05",
    verifiedAssessmentScores: [
      { assessment: "Backend fundamentals", score: 87, verified: true },
      { assessment: "API design", score: 82, verified: true }
    ],
    techStack: ["Go", "PostgreSQL", "gRPC", "Redis", "Terraform"],
    githubRepoStats: { repositories: 11, stars: 96, forks: 19 },
    codeSnippet: "func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {\n    result := h.service.Lookup(r.Context(), r.PathValue(\"id\"))\n    writeJSON(w, http.StatusOK, result)\n}"
  }
];
