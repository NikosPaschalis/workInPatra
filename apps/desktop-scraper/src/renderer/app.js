const api = window.workInPatra;
let state = null;
let selected = new Set();
let sort = { key: "date", direction: -1 };
let detailId = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeText = (value) => String(value ?? "");

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast visible${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = "toast"; }, 3500);
}

async function action(fn) {
  try { return await fn(); }
  catch (error) { toast(error.message || String(error), true); return null; }
}

function metric(label, value) {
  const div = document.createElement("div");
  div.className = "metric";
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  strong.textContent = value;
  span.textContent = label;
  div.append(strong, span);
  return div;
}

function filteredResults() {
  const query = $("#search").value.trim().toLocaleLowerCase();
  const source = $("#source-filter").value;
  const status = $("#status-filter").value;
  return state.results.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.category}`.toLocaleLowerCase();
    return (!query || haystack.includes(query)) && (!source || job.source === source) && (!status || job.validationStatus === status);
  }).sort((a, b) => {
    const left = a[sort.key] ?? "";
    const right = b[sort.key] ?? "";
    return String(left).localeCompare(String(right), undefined, { numeric: true }) * sort.direction;
  });
}

function button(label, title, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.title = title;
  element.addEventListener("click", handler);
  return element;
}

function renderTable() {
  const body = $("#results-body");
  body.replaceChildren();
  const rows = filteredResults();
  $("#empty-state").hidden = rows.length > 0;
  for (const job of rows) {
    const tr = document.createElement("tr");
    const checkboxCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(job.id);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? selected.add(job.id) : selected.delete(job.id);
      $("#selected-count").textContent = `${selected.size} selected`;
    });
    checkboxCell.append(checkbox);
    const values = [job.title, job.company || "—", job.location || "—", job.source, job.category || "other", job.date ? job.date.slice(0, 10) : job.dateRaw || "Unknown"];
    const cells = values.map((value, index) => {
      const td = document.createElement("td");
      td.textContent = escapeText(value);
      if (index === 0) td.className = "title-cell";
      if ([1, 2, 5].includes(index)) td.classList.add("muted");
      return td;
    });
    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${job.validationStatus}`;
    badge.textContent = job.approved ? "approved" : job.rejected ? "rejected" : job.validationStatus.replaceAll("_", " ");
    statusCell.append(badge);
    const actions = document.createElement("td");
    actions.className = "row-actions";
    actions.append(
      button("Inspect", "Inspect listing", () => showDetail(job.id)),
      button("Approve", "Approve listing", () => action(() => api.setReview([job.id], "approve"))),
      button("Reject", "Reject listing", () => action(() => api.setReview([job.id], "reject")))
    );
    tr.append(checkboxCell, ...cells, statusCell, actions);
    body.append(tr);
  }
  $("#selected-count").textContent = `${selected.size} selected`;
}

function renderSources() {
  for (const [source, info] of Object.entries(state.sources)) {
    const dot = $(`#source-${source}`);
    dot.className = `status-dot ${info.status}`;
    $(`#source-${source}-detail`).textContent = `${info.status}${info.count ? ` · ${info.count}` : ""}${info.detail ? ` · ${info.detail}` : ""}`;
  }
  $$("#source-grid input").forEach((input) => { input.disabled = state.scanRunning; });
  $("#run-button").disabled = state.scanRunning;
  $("#cancel-button").disabled = !state.scanRunning;
  $("#global-status").textContent = state.scanRunning ? "Scan running" : state.lastScanAt ? `Last scan ${new Date(state.lastScanAt).toLocaleString()}` : "Ready";
}

function renderMetrics() {
  const labels = [
    ["Discovered", state.dashboard.discovered], ["New candidates", state.dashboard.newCandidates],
    ["Published", state.dashboard.published], ["Already queued", state.dashboard.queued],
    ["Duplicates", state.dashboard.suspectedDuplicates], ["Needs review", state.dashboard.review],
    ["Approved", state.dashboard.approved],
  ];
  $("#metrics").replaceChildren(...labels.map(([label, value]) => metric(label, value)));
}

function renderGithub() {
  $("#github-status").textContent = state.github.authenticated ? "Authenticated" : "Not authenticated";
  $("#github-ready").textContent = `${state.dashboard.approved} approved`;
  $("#auth-form").hidden = state.github.authenticated;
  $("#disconnect-button").disabled = !state.github.authenticated;
  $("#upload-button").disabled = !state.github.authenticated || state.dashboard.approved === 0;
  $("#upload-error").textContent = state.lastUploadError || "";
  const commit = state.lastSuccessfulCommit;
  const commitResult = $("#commit-result");
  commitResult.replaceChildren();
  if (commit) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = `Verified commit ${commit.sha.slice(0, 8)} · ${commit.count} queued`;
    link.addEventListener("click", (event) => { event.preventDefault(); toast(commit.url); });
    commitResult.append(link);
  }
}

function renderActivity() {
  const list = $("#activity-log");
  list.replaceChildren();
  for (const entry of [...state.activity].reverse()) {
    const li = document.createElement("li");
    const time = document.createElement("time");
    const message = document.createElement("span");
    time.textContent = new Date(entry.at).toLocaleTimeString();
    message.textContent = entry.message;
    message.className = entry.level || "info";
    li.append(time, message);
    list.append(li);
  }
}

function render(next) {
  state = next;
  const knownIds = new Set(state.results.map((job) => job.id));
  selected = new Set([...selected].filter((id) => knownIds.has(id)));
  renderSources();
  renderMetrics();
  renderTable();
  renderGithub();
  renderActivity();
}

function showDetail(id) {
  const job = state.results.find((item) => item.id === id);
  if (!job) return;
  detailId = id;
  $("#detail-title").textContent = job.title;
  const fields = $("#detail-fields");
  fields.replaceChildren();
  const entries = {
    Company: job.company || "Not provided", Location: job.location || "Not provided",
    Source: job.source, Category: job.category, "Source category": job.sourceCategory || "Not provided",
    "Publication evidence": job.dateRaw || "Unavailable", "Normalized date": job.date || "Unknown",
    "Validation status": job.validationStatus, "Validation notes": (job.validationReasons || []).join(", ") || "None",
    URL: job.canonicalUrl || job.url,
  };
  for (const [label, value] of Object.entries(entries)) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    fields.append(div);
  }
  $("#detail-dialog").showModal();
}

$("#run-button").addEventListener("click", () => action(() => {
  const sources = $$("#source-grid input:checked").map((input) => input.value);
  if (!sources.length) throw new Error("Select at least one source");
  return api.startScan(sources);
}));
$("#cancel-button").addEventListener("click", () => action(() => api.cancelScan()));
$("#export-button").addEventListener("click", () => action(() => api.exportResults()));
$("#search").addEventListener("input", renderTable);
$("#source-filter").addEventListener("change", renderTable);
$("#status-filter").addEventListener("change", renderTable);
$$('th button[data-sort]').forEach((element) => element.addEventListener("click", () => {
  const key = element.dataset.sort;
  sort = { key, direction: sort.key === key ? -sort.direction : 1 };
  renderTable();
}));
$("#approve-eligible").addEventListener("click", () => {
  selected = new Set(filteredResults().filter((job) => job.validationStatus === "new").map((job) => job.id));
  renderTable();
});
for (const [selector, decision] of [["#approve-selected", "approve"], ["#reject-selected", "reject"], ["#reset-selected", "reset"]]) {
  $(selector).addEventListener("click", () => action(async () => {
    await api.setReview([...selected], decision);
    selected.clear();
  }));
}
$("#auth-button").addEventListener("click", () => action(async () => {
  const input = $("#github-token");
  const token = input.value;
  input.value = "";
  await api.authenticateGitHub(token, $("#persist-token").checked);
}));
$("#disconnect-button").addEventListener("click", () => action(() => api.disconnectGitHub()));
$("#upload-button").addEventListener("click", () => action(() => api.uploadApproved()));
$("#clear-history").addEventListener("click", () => {
  if (confirm("Clear local scan results and activity history? Approved drafts will be removed.")) action(() => api.clearHistory());
});
$("#export-log").addEventListener("click", () => action(() => api.exportDiagnostics()));
$("#copy-log").addEventListener("click", () => {
  const text = state.activity.map((entry) => `${entry.at} [${entry.level}] ${entry.message}`).join("\n");
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  toast("Diagnostics copied");
});
$("#close-detail").addEventListener("click", () => $("#detail-dialog").close());
$("#detail-open").addEventListener("click", () => action(() => api.openExternal(detailId)));
$("#detail-approve").addEventListener("click", () => action(async () => { await api.setReview([detailId], "approve"); $("#detail-dialog").close(); }));
$("#detail-reject").addEventListener("click", () => action(async () => { await api.setReview([detailId], "reject"); $("#detail-dialog").close(); }));

api.onState(render);
action(async () => render(await api.getState()));
