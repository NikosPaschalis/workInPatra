// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sources:  new Set(["jobfind", "kariera", "xe", "indeed"]),
  days:     30,
  search:   "",
  sort:     "date",
  category: "all",
  jobs:     [],
  loading:  false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const grid        = document.getElementById("job-grid");
const emptyState  = document.getElementById("empty-state");
const countLabel  = document.getElementById("count-label");
const template    = document.getElementById("card-template");
const searchInput = document.getElementById("search-input");
const sortSelect  = document.getElementById("sort-select");
const btnRefresh  = document.getElementById("btn-refresh");
const lastUpdated = document.getElementById("last-updated");
const statTotal   = document.getElementById("stat-total");
const categoryBar       = document.getElementById("category-bar");
const catDropdownBtn    = document.getElementById("cat-dropdown-btn");
const catDropdownPanel  = document.getElementById("cat-dropdown-panel");
const catDropdownLabel  = document.getElementById("cat-dropdown-label");

const SOURCE_LABELS = { jobfind: "JobFind", kariera: "Kariera", xe: "XE", indeed: "Indeed" };

const CATEGORY_LABELS = {
  tech:         "💻 Πληροφορική",
  sales:        "🛒 Πωλήσεις",
  hospitality:  "🍽 Εστίαση & Τουρισμός",
  health:       "🏥 Υγεία & Φαρμακείο",
  logistics:    "🚛 Μεταφορές & Αποθήκη",
  admin:        "📋 Διοίκηση & Λογιστική",
  retail:       "🏪 Λιανική & Εξυπηρέτηση",
  construction: "🔧 Τεχνικά & Κατασκευές",
  education:    "📚 Εκπαίδευση",
  other:        "📌 Άλλα",
};

// Plain (no emoji) labels for SEO meta tags
const CATEGORY_SEO = {
  tech:         "Πληροφορική",
  sales:        "Πωλήσεις",
  hospitality:  "Εστίαση & Τουρισμός",
  health:       "Υγεία & Φαρμακείο",
  logistics:    "Μεταφορές & Αποθήκη",
  admin:        "Διοίκηση & Λογιστική",
  retail:       "Λιανική & Εξυπηρέτηση",
  construction: "Τεχνικά & Κατασκευές",
  education:    "Εκπαίδευση",
  other:        "Άλλα",
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return "";
  const now  = new Date();
  const d    = new Date(isoStr);
  // Compare calendar days (local midnight) — avoids "Σήμερα" for jobs
  // scraped yesterday at an hour that's < 24h ago in absolute ms.
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight  = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const diff = Math.round((todayMidnight - dateMidnight) / 86400000);
  if (diff === 0) return "Σήμερα";
  if (diff === 1) return "Χθες";
  if (diff < 7)  return `${diff} μέρες πριν`;
  if (diff < 14) return "Πριν 1 εβδομάδα";
  return `Πριν ${Math.floor(diff / 7)} εβδομάδες`;
}

// ── Category bar — built dynamically from actual data ─────────────────────────
function buildCategoryBar() {
  const counts = {};
  // Count only jobs that pass the current date + source filters
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - state.days);
  cutoff.setHours(0, 0, 0, 0);

  state.jobs
    .filter(j =>
      state.sources.has(j.source) &&
      !(j.date && new Date(j.date) < cutoff)
    )
    .forEach(j => {
      const cat = j.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // ── Desktop pill buttons ──
  categoryBar.querySelectorAll(".cat-btn[data-cat]").forEach(b => {
    if (b.dataset.cat !== "all") b.remove();
  });
  sorted.forEach(([cat, count]) => {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (state.category === cat ? " active" : "");
    btn.dataset.cat = cat;
    btn.textContent = `${CATEGORY_LABELS[cat] || cat} (${count})`;
    btn.addEventListener("click", () => setCat(cat));
    categoryBar.appendChild(btn);
  });

  // ── Mobile dropdown panel ──
  catDropdownPanel.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "cat-btn" + (state.category === "all" ? " active" : "");
  allBtn.textContent = "Όλες";
  allBtn.addEventListener("click", () => { setCat("all"); closeDropdown(); });
  catDropdownPanel.appendChild(allBtn);

  sorted.forEach(([cat, count]) => {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (state.category === cat ? " active" : "");
    btn.textContent = `${CATEGORY_LABELS[cat] || cat} (${count})`;
    btn.addEventListener("click", () => { setCat(cat); closeDropdown(); });
    catDropdownPanel.appendChild(btn);
  });
}

function setCat(cat) {
  state.category = cat;
  // update desktop pills
  categoryBar.querySelectorAll(".cat-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.cat === cat)
  );
  // update mobile dropdown label
  const label = cat === "all"
    ? "Όλες οι κατηγορίες"
    : CATEGORY_LABELS[cat] || cat;
  catDropdownLabel.textContent = label;
  updateURL();
  updateSEO();
  render();
}

// ── URL state (sharable + bookmarkable) ──────────────────────────────────────
function updateURL() {
  const params = new URLSearchParams();
  if (state.category !== "all") params.set("cat", state.category);
  if (state.search)             params.set("q", state.search);
  if (state.days !== 30)        params.set("days", state.days);
  if (state.sort !== "date")    params.set("sort", state.sort);
  if (state.sources.size !== allSources.length) {
    params.set("src", [...state.sources].join(","));
  }
  const qs = params.toString();
  const newUrl = window.location.pathname + (qs ? "?" + qs : "");
  history.replaceState(null, "", newUrl);
}

function readURL() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (cat && (cat === "all" || CATEGORY_LABELS[cat])) state.category = cat;
  const q = params.get("q");
  if (q) {
    state.search = q;
    searchInput.value = q;
  }
  const days = parseInt(params.get("days"));
  if (days === 7 || days === 30) {
    state.days = days;
    document.querySelectorAll(".period-tab").forEach(b => {
      b.classList.toggle("active", parseInt(b.dataset.days) === days);
    });
  }
  const sort = params.get("sort");
  if (sort === "title" || sort === "date") {
    state.sort = sort;
    sortSelect.value = sort;
  }
  const src = params.get("src");
  if (src) {
    const parts = src.split(",").filter(s => allSources.includes(s));
    if (parts.length) {
      state.sources = new Set(parts);
    }
  }
  // Update dropdown label for preselected category
  if (state.category !== "all") {
    catDropdownLabel.textContent = CATEGORY_LABELS[state.category] || state.category;
  }
}

// ── Dynamic SEO — update title + meta based on active category ──────────────
function updateSEO() {
  const baseTitle = "WorkInPάτρα — Θέσεις Εργασίας στην Πάτρα";
  const baseDesc  = "Βρες τις πιο πρόσφατες θέσεις εργασίας στην Πάτρα. Συγκεντρώνουμε αγγελίες από JobFind, Kariera, XE και Indeed σε ένα μέρος, ενημερωμένες καθημερινά.";

  let title = baseTitle;
  let desc  = baseDesc;

  if (state.category !== "all" && CATEGORY_SEO[state.category]) {
    const catName = CATEGORY_SEO[state.category];
    title = `Θέσεις Εργασίας ${catName} στην Πάτρα — WorkInPάτρα`;
    desc  = `Αγγελίες εργασίας για ${catName} στην Πάτρα. Συγκεντρωμένες από JobFind, Kariera, XE και Indeed — ενημερωμένες καθημερινά.`;
  }

  document.title = title;
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute("content", desc);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", title);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", desc);
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", title);
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", desc);
}

function closeDropdown() {
  catDropdownPanel.classList.remove("open");
  catDropdownBtn.setAttribute("aria-expanded", "false");
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - state.days);
  cutoff.setHours(0, 0, 0, 0);

  let filtered = state.jobs.filter(j => {
    if (!state.sources.has(j.source)) return false;
    if (j.date && new Date(j.date) < cutoff) return false;
    if (state.category !== "all" && j.category !== state.category) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      if (!j.title?.toLowerCase().includes(q) && !j.company?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (state.sort === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title, "el"));
  } else {
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  grid.innerHTML = "";
  const count = filtered.length;

  // Trust stat — count jobs from the last 7 days within the filtered set
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const newCount = filtered.filter(j => j.date && new Date(j.date) >= weekStart).length;

  countLabel.innerHTML = state.loading
    ? "Φόρτωση…"
    : `<strong>${count}</strong> θέσ${count === 1 ? "η" : "εις"} εργασίας` +
      (newCount > 0 && count !== newCount
        ? ` <span class="new-count">· ${newCount} νέες αυτή την εβδομάδα</span>`
        : "");

  if (count === 0 && !state.loading) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach((job, i) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".job-card");
    card.style.animationDelay = `${i * 40}ms`;

    const badge = card.querySelector(".card-source-badge");
    badge.textContent = SOURCE_LABELS[job.source] || job.source;
    badge.classList.add(`badge-${job.source}`);

    const dateLabel = formatDate(job.date);
    card.querySelector(".card-date").textContent = dateLabel;

    // "Νέο" badge — visible only for today's listings
    if (dateLabel === "Σήμερα") {
      card.querySelector(".card-new-badge").classList.remove("hidden");
    }
    card.querySelector(".card-title").textContent   = job.title;
    card.querySelector(".card-company").textContent = job.company || "—";

    const tagsEl = card.querySelector(".card-tags");
    (job.tags || []).forEach(t => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagsEl.appendChild(span);
    });

    const link = card.querySelector(".card-link");
    link.href = job.url || "#";
    if (!job.url) link.style.display = "none";

    grid.appendChild(node);
  });
}

// ── API ───────────────────────────────────────────────────────────────────────
async function loadJobs(forceRefresh = false) {
  state.loading = true;
  render();
  btnRefresh.classList.add("spinning");

  try {
    // Static JSON file — cache-bust on manual refresh
    const url = `/data/jobs.json${forceRefresh ? "?t=" + Date.now() : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.jobs = data.jobs || [];
    if (statTotal) statTotal.textContent = state.jobs.length;
    if (data.lastFetched) {
      const d = new Date(data.lastFetched);
      const label = d.toLocaleString("el-GR", {
        day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
      lastUpdated.textContent = `Τελευταία ενημέρωση: ${label}`;
    }
    buildCategoryBar();
  } catch (err) {
    console.error("Failed to load jobs:", err);
    countLabel.innerHTML = `<span style="color:#ef4444">Σφάλμα φόρτωσης. Δοκίμασε ξανά.</span>`;
  } finally {
    state.loading = false;
    btnRefresh.classList.remove("spinning");
    render();
  }
}

// ── Source chips ──────────────────────────────────────────────────────────────
const allSources = ["jobfind", "kariera", "xe", "indeed"];

function syncChipUI() {
  const allChecked = allSources.every(s => state.sources.has(s));
  document.getElementById("src-all").checked     = allChecked;
  document.getElementById("src-jobfind").checked = state.sources.has("jobfind");
  document.getElementById("src-kariera").checked = state.sources.has("kariera");
  document.getElementById("src-xe").checked      = state.sources.has("xe");
  document.getElementById("src-indeed").checked  = state.sources.has("indeed");
}

document.getElementById("src-all").addEventListener("change", e => {
  if (e.target.checked) allSources.forEach(s => state.sources.add(s));
  else allSources.forEach(s => state.sources.delete(s));
  syncChipUI(); buildCategoryBar(); updateURL(); render();
});

allSources.forEach(src => {
  document.getElementById(`src-${src}`).addEventListener("change", e => {
    if (e.target.checked) state.sources.add(src);
    else state.sources.delete(src);
    syncChipUI(); buildCategoryBar(); updateURL(); render();
  });
});

// ── Period tabs ───────────────────────────────────────────────────────────────
document.querySelectorAll(".period-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".period-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.days = parseInt(btn.dataset.days);
    buildCategoryBar(); updateURL(); render();
  });
});

// ── Popular search chips ──────────────────────────────────────────────────────
document.querySelectorAll(".popular-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const q = chip.dataset.q || "";
    state.search = q;
    searchInput.value = q;
    updateURL();
    render();
    // Nice UX: scroll results into view
    document.getElementById("job-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// ── Category "all" button (desktop) ──────────────────────────────────────────
categoryBar.querySelector("[data-cat='all']").addEventListener("click", () => setCat("all"));

// ── Mobile dropdown toggle ────────────────────────────────────────────────────
catDropdownBtn.addEventListener("click", e => {
  e.stopPropagation();
  const isOpen = catDropdownPanel.classList.toggle("open");
  catDropdownBtn.setAttribute("aria-expanded", isOpen);
});

// Close when clicking outside
document.addEventListener("click", () => closeDropdown());

// ── Search & Sort ─────────────────────────────────────────────────────────────
searchInput.addEventListener("input", e => { state.search = e.target.value.trim(); updateURL(); render(); });
sortSelect.addEventListener("change",  e => { state.sort  = e.target.value;        updateURL(); render(); });

// ── Refresh button ────────────────────────────────────────────────────────────
btnRefresh.addEventListener("click", () => loadJobs(true));

// ── Init ──────────────────────────────────────────────────────────────────────
readURL();
syncChipUI();
updateSEO();
loadJobs();
