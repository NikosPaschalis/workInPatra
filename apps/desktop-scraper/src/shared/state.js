export const SOURCES = Object.freeze(["kariera", "jobfind", "xe"]);
export const SOURCE_STATES = Object.freeze(["idle", "running", "success", "blocked", "failed", "skipped", "cancelled"]);

export function createInitialState() {
  return {
    version: 1,
    selectedSources: [...SOURCES],
    sources: Object.fromEntries(SOURCES.map((source) => [source, { status: "idle", count: 0, detail: "" }])),
    results: [],
    activity: [],
    scanRunning: false,
    lastScanAt: null,
    lastSuccessfulCommit: null,
    lastUploadError: null,
  };
}

export function restoreState(value) {
  const initial = createInitialState();
  if (!value || value.version !== 1) return initial;
  const selectedSources = Array.isArray(value.selectedSources)
    ? value.selectedSources.filter((source) => SOURCES.includes(source))
    : initial.selectedSources;
  const sources = { ...initial.sources };
  for (const source of SOURCES) {
    const prior = value.sources?.[source];
    if (!prior) continue;
    sources[source] = {
      status: prior.status === "running" ? "cancelled" : SOURCE_STATES.includes(prior.status) ? prior.status : "idle",
      count: Number.isInteger(prior.count) ? prior.count : 0,
      detail: String(prior.detail || ""),
    };
  }
  return {
    ...initial,
    ...value,
    selectedSources,
    sources,
    results: Array.isArray(value.results) ? value.results : [],
    activity: Array.isArray(value.activity) ? value.activity.slice(-500) : [],
    scanRunning: false,
  };
}

export function publicState(state, github = {}) {
  return {
    ...state,
    github: {
      authenticated: Boolean(github.authenticated),
      repository: "NikosPaschalis/workInPatra",
      branch: "main",
    },
  };
}

export function dashboardCounts(results, sources) {
  const count = (status) => results.filter((job) => job.validationStatus === status).length;
  return {
    discovered: results.length,
    newCandidates: count("new"),
    published: count("published") + count("previously_published"),
    queued: count("queued"),
    suspectedDuplicates: count("suspected_duplicate") + count("duplicate"),
    review: count("review") + count("invalid"),
    approved: results.filter((job) => job.approved).length,
    failedSources: Object.values(sources).filter((source) => ["failed", "blocked"].includes(source.status)).length,
  };
}
