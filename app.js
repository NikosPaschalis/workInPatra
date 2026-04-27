// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sources:    new Set(["jobfind", "kariera", "xe"]),
  days:       30,
  search:     "",
  sort:       "date",
  categories: new Set(), // empty = all categories
  jobs:       [],
  loading:    false,
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
const searchClearBtn    = document.getElementById("search-clear");

const SOURCE_LABELS = { jobfind: "JobFind", kariera: "Kariera", xe: "XE" };

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
function isCatActive(cat) {
  if (cat === "all") return state.categories.size === 0;
  return state.categories.has(cat);
}

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
  // Update "all" button state
  const allBtnDesktop = categoryBar.querySelector("[data-cat='all']");
  if (allBtnDesktop) allBtnDesktop.classList.toggle("active", isCatActive("all"));

  sorted.forEach(([cat, count]) => {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (isCatActive(cat) ? " active" : "");
    btn.dataset.cat = cat;
    btn.textContent = `${CATEGORY_LABELS[cat] || cat} (${count})`;
    btn.addEventListener("click", () => toggleCat(cat));
    categoryBar.appendChild(btn);
  });

  // ── Mobile dropdown panel ──
  catDropdownPanel.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "cat-btn" + (isCatActive("all") ? " active" : "");
  allBtn.dataset.cat = "all";
  allBtn.textContent = "Όλες";
  allBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCat("all");
  });
  catDropdownPanel.appendChild(allBtn);

  sorted.forEach(([cat, count]) => {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (isCatActive(cat) ? " active" : "");
    btn.dataset.cat = cat;
    btn.textContent = `${CATEGORY_LABELS[cat] || cat} (${count})`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCat(cat);
      // Keep dropdown open for multi-select — user explicitly closes with "Όλες" or outside click
    });
    catDropdownPanel.appendChild(btn);
  });
}

function toggleCat(cat) {
  if (cat === "all") {
    // Clear all — show everything
    state.categories.clear();
  } else {
    if (state.categories.has(cat)) state.categories.delete(cat);
    else                           state.categories.add(cat);
  }
  syncCategoryUI();
  updateURL();
  updateSEO();
  render();
}

function syncCategoryUI() {
  // desktop + mobile pills
  document.querySelectorAll(".cat-btn").forEach(b => {
    const cat = b.dataset.cat;
    if (cat === "all") {
      b.classList.toggle("active", isCatActive("all"));
    } else if (cat) {
      b.classList.toggle("active", isCatActive(cat));
    } else {
      // mobile panel buttons built without data-cat use textContent match
      const txt = b.textContent.replace(/\s*\(\d+\)$/, "");
      const match = Object.entries(CATEGORY_LABELS).find(([, label]) => label === txt);
      if (match) b.classList.toggle("active", isCatActive(match[0]));
    }
  });
  // mobile dropdown label
  const cats = [...state.categories];
  let label;
  if (cats.length === 0)      label = "Όλες οι κατηγορίες";
  else if (cats.length === 1) label = CATEGORY_LABELS[cats[0]] || cats[0];
  else                        label = `${cats.length} κατηγορίες`;
  catDropdownLabel.textContent = label;
}

// ── Popular chips sync ───────────────────────────────────────────────────────
function syncPopularChips() {
  document.querySelectorAll(".popular-chip").forEach(chip => {
    const q = chip.dataset.q || "";
    chip.classList.toggle("active", state.search === q && q !== "");
  });
}

// ── Search clear (X) button ──────────────────────────────────────────────────
function syncSearchClear() {
  if (!searchClearBtn) return;
  searchClearBtn.classList.toggle("hidden", !state.search);
}

// ── URL state (sharable + bookmarkable) ──────────────────────────────────────
function updateURL() {
  const params = new URLSearchParams();
  if (state.categories.size > 0) params.set("cat", [...state.categories].join(","));
  if (state.search)              params.set("q", state.search);
  if (state.days !== 30)         params.set("days", state.days);
  if (state.sort !== "date")     params.set("sort", state.sort);
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
  if (cat) {
    const parts = cat.split(",").filter(c => CATEGORY_LABELS[c]);
    if (parts.length) state.categories = new Set(parts);
  }
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
  syncCategoryUI();
}

// ── Dynamic SEO — update title + meta based on active category ──────────────
function updateSEO() {
  const baseTitle = "WorkInPάτρα — Θέσεις Εργασίας στην Πάτρα";
  const baseDesc  = "Βρες τις πιο πρόσφατες θέσεις εργασίας στην Πάτρα. Συγκεντρώνουμε αγγελίες από JobFind, Kariera και XE σε ένα μέρος, ενημερωμένες καθημερινά.";

  let title = baseTitle;
  let desc  = baseDesc;

  // Use specialized SEO copy only when exactly one category is selected
  if (state.categories.size === 1) {
    const onlyCat = [...state.categories][0];
    if (CATEGORY_SEO[onlyCat]) {
      const catName = CATEGORY_SEO[onlyCat];
      title = `Θέσεις Εργασίας ${catName} στην Πάτρα — WorkInPάτρα`;
      desc  = `Αγγελίες εργασίας για ${catName} στην Πάτρα. Συγκεντρωμένες από JobFind, Kariera και XE — ενημερωμένες καθημερινά.`;
    }
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
    if (state.categories.size > 0 && !state.categories.has(j.category || "other")) return false;
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
const allSources = ["jobfind", "kariera", "xe"];

function syncChipUI() {
  const allChecked = allSources.every(s => state.sources.has(s));
  document.getElementById("src-all").checked     = allChecked;
  document.getElementById("src-jobfind").checked = state.sources.has("jobfind");
  document.getElementById("src-kariera").checked = state.sources.has("kariera");
  document.getElementById("src-xe").checked      = state.sources.has("xe");
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
    // Toggle: clicking an already-active chip clears the search
    if (state.search === q) {
      state.search = "";
      searchInput.value = "";
    } else {
      state.search = q;
      searchInput.value = q;
    }
    syncPopularChips();
    syncSearchClear();
    updateURL();
    render();
    document.getElementById("job-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// ── Search clear (X) button ──────────────────────────────────────────────────
if (searchClearBtn) {
  searchClearBtn.addEventListener("click", () => {
    state.search = "";
    searchInput.value = "";
    syncPopularChips();
    syncSearchClear();
    updateURL();
    render();
    searchInput.focus();
  });
}

// ── Category "all" button (desktop) ──────────────────────────────────────────
categoryBar.querySelector("[data-cat='all']").addEventListener("click", () => toggleCat("all"));

// ── Mobile dropdown toggle ────────────────────────────────────────────────────
catDropdownBtn.addEventListener("click", e => {
  e.stopPropagation();
  const isOpen = catDropdownPanel.classList.toggle("open");
  catDropdownBtn.setAttribute("aria-expanded", isOpen);
});

// Close when clicking outside
document.addEventListener("click", () => closeDropdown());

// ── Search & Sort ─────────────────────────────────────────────────────────────
searchInput.addEventListener("input", e => {
  state.search = e.target.value.trim();
  syncPopularChips();
  syncSearchClear();
  updateURL();
  render();
});
sortSelect.addEventListener("change",  e => { state.sort  = e.target.value;        updateURL(); render(); });

// ── Refresh button ────────────────────────────────────────────────────────────
btnRefresh.addEventListener("click", () => loadJobs(true));

// ── Init ──────────────────────────────────────────────────────────────────────
readURL();
syncChipUI();
syncPopularChips();
syncSearchClear();
updateSEO();
loadJobs();
