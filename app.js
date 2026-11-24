import {
  compareJobsByDateNewestFirst,
  athensCalendarAge,
  isJobWithinAgeWindow,
  jobAgeBasis,
  normalizeSearchText,
} from "./client-utils.js";
import { CATEGORY_DEFINITIONS } from "./categories.js";

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  sources:    new Set(["jobfind", "kariera", "xe", "direct", "corporate"]),
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
const emptyMessage = document.getElementById("empty-message");
const countLabel  = document.getElementById("count-label");
const template    = document.getElementById("card-template");
const searchInput = document.getElementById("search-input");
const sortSelect  = document.getElementById("sort-select");
const btnRefresh  = document.getElementById("btn-refresh");
const lastUpdated = document.getElementById("last-updated");
const statTotal   = document.getElementById("stat-total");
const categoryBar       = document.getElementById("category-bar");
const catDropdownPanel  = document.getElementById("cat-dropdown-panel");
const searchClearBtn    = document.getElementById("search-clear");
const filtersToggle     = document.getElementById("filters-toggle");
const advancedFilters   = document.getElementById("advanced-filters");
const filtersCount      = document.getElementById("filters-count");
const filtersClear      = document.getElementById("filters-clear");
const filtersDone       = document.getElementById("filters-done");
const moreCategoriesBtn = document.getElementById("more-categories-btn");

const SOURCE_LABELS = { jobfind: "JobFind", kariera: "Kariera", xe: "XE", direct: "Απευθείας", corporate: "Εταιρική σελίδα" };

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_DEFINITIONS.map(category => [
    category.id,
    `${category.emoji} ${category.label}`,
  ])
);

// Plain (no emoji) labels for SEO meta tags
const CATEGORY_SEO = Object.fromEntries(
  CATEGORY_DEFINITIONS.map(category => [category.id, category.label])
);

// Fixed order keeps controls predictable across days and source filters.
const QUICK_CATEGORIES = [
  { id: "sales", label: "Πωλήσεις & Λιανική" },
  { id: "logistics", label: "Logistics" },
  { id: "construction", label: "Τεχνικά" },
];
const QUICK_LABELS = Object.fromEntries(QUICK_CATEGORIES.map(c => [c.id,c.label]));
const selectedExtraCategories = document.getElementById("selected-extra-categories");
let filterOpener = null;

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDate(isoStr) {
  if (!isoStr) return "";
  const diff = athensCalendarAge(isoStr);
  if (!Number.isFinite(diff) || diff < 0) return "";
  if (diff <= 0) return "Σήμερα";
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

function createCategoryButton(cat, count, { compact = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cat-btn" + (isCatActive(cat) ? " active" : "");
  if (compact) btn.classList.add("cat-btn-quick");
  btn.dataset.cat = cat;
  btn.textContent = cat === "all"
    ? "Όλες"
    : `${compact ? QUICK_LABELS[cat] : CATEGORY_LABELS[cat] || cat} (${count})`;
  btn.setAttribute("aria-pressed", String(isCatActive(cat)));
  if (compact) btn.setAttribute("aria-label", `${CATEGORY_SEO[cat]} (${count})`);
  btn.addEventListener("click", () => toggleCat(cat));
  return btn;
}

function buildCategoryBar() {
  const counts = {};
  // Count only jobs that pass the current date + source filters
  const now = new Date();

  state.jobs
    .filter(j =>
      state.sources.has(j.source) &&
      isJobWithinAgeWindow(j, state.days, now) &&
      (!state.search || j._searchText.includes(normalizeSearchText(state.search)))
    )
    .forEach(j => {
      const cat = j.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    });

  categoryBar.querySelectorAll(".cat-btn[data-cat]:not([data-cat='all'])").forEach(b=>b.remove());
  for (const { id } of QUICK_CATEGORIES) {
    categoryBar.appendChild(createCategoryButton(id, counts[id] || 0, { compact: true }));
  }

  // Show the entire stable taxonomy, including empty or currently selected categories.
  catDropdownPanel.replaceChildren(createCategoryButton("all", 0));
  for (const { id } of CATEGORY_DEFINITIONS) {
    catDropdownPanel.appendChild(createCategoryButton(id, counts[id] || 0));
  }
  syncCategoryUI();
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
  // Selections outside the shortcuts remain visible and individually removable.
  selectedExtraCategories.replaceChildren();
  for (const {id,label} of CATEGORY_DEFINITIONS) {
    if (!state.categories.has(id) || QUICK_LABELS[id]) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "selected-category-remove";
    btn.textContent = label + " ×";
    btn.setAttribute("aria-label", "Αφαίρεση κατηγορίας: " + label);
    btn.addEventListener("click", () => { toggleCat(id); moreCategoriesBtn.focus(); });
    selectedExtraCategories.appendChild(btn);
  }
  selectedExtraCategories.classList.toggle("hidden", !selectedExtraCategories.childElementCount);
  document.querySelectorAll(".cat-btn").forEach(b => {
    const active = isCatActive(b.dataset.cat);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
}

// ── Popular chips sync ───────────────────────────────────────────────────────
function syncPopularChips() {
  document.querySelectorAll(".popular-chip").forEach(chip => {
    const q = chip.dataset.q || "";
    const active = state.search === q && q !== "";
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
}

// ── Search clear (X) button ──────────────────────────────────────────────────
function syncSearchClear() {
  if (!searchClearBtn) return;
  searchClearBtn.classList.toggle("hidden", !state.search);
}

function getActiveFilterCount() {
  let count = state.categories.size;
  if (state.sources.size !== allSources.length) count += 1;
  if (state.days !== 30) count += 1;
  return count;
}

function syncFilterSummary() {
  if (!filtersCount) return;
  const count = getActiveFilterCount();
  filtersCount.textContent = count;
  filtersCount.classList.toggle("hidden", count === 0);

  document.querySelectorAll(".period-tab").forEach(btn => {
    btn.setAttribute("aria-pressed", String(parseInt(btn.dataset.days) === state.days));
  });
}

function setAdvancedFiltersOpen(isOpen, opener = null) {
  if (isOpen && opener) filterOpener = opener;
  advancedFilters.classList.toggle("hidden", !isOpen);
  filtersToggle.setAttribute("aria-expanded", String(isOpen));
  moreCategoriesBtn.setAttribute("aria-expanded", String(isOpen));
  filtersToggle.classList.toggle("active", isOpen);
  if (!isOpen && filterOpener) { filterOpener.focus({preventScroll:true}); filterOpener = null; }
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
    const parts = cat
      .split(",")
      .map(c => c === "retail" ? "sales" : c)
      .filter(c => CATEGORY_LABELS[c]);
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
  if (params.has("src")) {
    const src = params.get("src") || "";
    const parts = src.split(",").filter(s => allSources.includes(s));
    state.sources = new Set(parts);
  }
  syncCategoryUI();
}

// ── Dynamic SEO — update title + meta based on active category ──────────────
function updateSEO() {
  const baseTitle = "Θέσεις Εργασίας στην Πάτρα | WorkInPάτρα";
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

// Direct listings open inside the site; only the email action opens the mail app.
const directDialog = document.getElementById("direct-job-dialog");
const directClose = document.getElementById("direct-dialog-close");
directClose.addEventListener("click", () => directDialog.close());
directDialog.addEventListener("click", event => {
  if (event.target === directDialog) directDialog.close();
});

function openDirectJob(job) {
  document.getElementById("direct-dialog-title").textContent = job.title;
  document.getElementById("direct-dialog-company").textContent = job.company || "";
  const meta = document.getElementById("direct-dialog-meta");
  meta.replaceChildren();
  [job.location, job.employmentType].filter(Boolean).forEach(value => {
    const item = document.createElement("span");
    item.textContent = value;
    meta.appendChild(item);
  });
  document.getElementById("direct-dialog-description").textContent = job.description || "";
  const benefits = document.getElementById("direct-dialog-benefits");
  benefits.replaceChildren();
  (job.benefits || []).forEach(benefit => {
    const li = document.createElement("li");
    li.textContent = benefit;
    benefits.appendChild(li);
  });
  document.getElementById("direct-dialog-benefits-section").hidden = !(job.benefits || []).length;
  document.getElementById("direct-dialog-email").textContent = job.applicationEmail || "";
  const apply = document.getElementById("direct-dialog-apply-link");
  apply.href = job.url || "#";
  apply.hidden = !job.url;
  directDialog.showModal();
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  syncFilterSummary();
  const now = new Date();
  const normalizedQuery = normalizeSearchText(state.search);

  let filtered = state.jobs.filter(j => {
    if (!state.sources.has(j.source)) return false;
    if (!isJobWithinAgeWindow(j, state.days, now)) return false;
    if (state.categories.size > 0 && !state.categories.has(j.category || "other")) return false;
    if (normalizedQuery && !j._searchText.includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  if (state.sort === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title, "el"));
  } else {
    filtered.sort(compareJobsByDateNewestFirst);
  }

  grid.innerHTML = "";
  const count = filtered.length;

  // Trust stat — count jobs from the last 7 days within the filtered set
  const newCount = filtered.filter(j => jobAgeBasis(j, now)?.kind === "published" && isJobWithinAgeWindow(j, 7, now)).length;

  countLabel.innerHTML = state.loading
    ? "Φόρτωση…"
    : `<strong>${count}</strong> θέσ${count === 1 ? "η" : "εις"} εργασίας` +
      (newCount > 0 && count !== newCount
        ? ` <span class="new-count">· ${newCount} νέες αυτή την εβδομάδα</span>`
        : "");

  if (count === 0 && !state.loading) {
    emptyMessage.textContent = state.sources.size === 0
      ? "Δεν έχεις επιλέξει καμία πηγή. Επίλεξε μία ή πάτησε «Όλα»."
      : "Δεν βρέθηκαν θέσεις για τα επιλεγμένα φίλτρα.";
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
    if (job.source === "corporate" && job.corporateStatus !== "verified") badge.textContent += " · Μη επανελεγμένη";

    const basis = jobAgeBasis(job, now);
    const dateLabel = formatDate(basis?.date);
    const dateEl = card.querySelector(".card-date");
    dateEl.textContent = basis?.kind === "first_seen" ? "Εντοπίστηκε: " + dateLabel : dateLabel;
    if (basis?.kind === "first_seen") dateEl.title = "Άγνωστη ημερομηνία δημοσίευσης — εμφανίζεται ο πρώτος καταγεγραμμένος εντοπισμός.";

    // "Νέο" badge — visible only for today's listings
    if (basis?.kind === "published" && dateLabel === "Σήμερα") {
      card.querySelector(".card-new-badge").classList.remove("hidden");
    }
    card.querySelector(".card-title").textContent   = job.title;
    card.querySelector(".card-company").textContent = job.company || "—";

    const tagsEl = card.querySelector(".card-tags");
    const cardTags = job.source === "corporate" ? [...(job.tags || []), job.location, job.locationNote].filter(Boolean) : job.source === "direct"
      ? [CATEGORY_SEO[job.category] || job.sourceCategory || "Άλλη κατηγορία"]
      : (job.tags || []);
    cardTags.forEach(t => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagsEl.appendChild(span);
    });

    const link = card.querySelector(".card-link");
    if (job.source === "direct") {
      card.classList.add("job-card-direct");
      link.textContent = "Προβολή αγγελίας";
      link.removeAttribute("target");
      link.removeAttribute("href");
      link.setAttribute("role", "button");
      link.setAttribute("tabindex", "0");
      const showDetails = event => {
        event.preventDefault();
        openDirectJob(job);
      };
      link.addEventListener("click", showDetails);
      link.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") showDetails(event);
      });
    } else {
      link.href = job.url || "#";
      if (!job.url) link.style.display = "none";
    }

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
    let directJobs = [];
    try {
      const directUrl = `/data/direct-jobs.json${forceRefresh ? "?t=" + Date.now() : ""}`;
      const directRes = await fetch(directUrl);
      if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
      const directData = await directRes.json();
      directJobs = Array.isArray(directData.jobs) ? directData.jobs.filter(job => job.source === "direct" && job.title && job.url) : [];
    } catch (directError) {
      console.warn("Could not load direct employer listings:", directError);
    }

    state.jobs = [...(data.jobs || []), ...directJobs].filter(j => !j.previewOnly).map(job => ({
      ...job,
      // Compatibility with jobs published before retail was merged into sales.
      category: job.category === "retail" ? "sales" : job.category,
      _searchText: normalizeSearchText(
        [job.title, job.company, ...(job.tags || [])].filter(Boolean).join(" ")
      ),
    }));
    if (statTotal) statTotal.textContent = state.jobs.filter(j => isJobWithinAgeWindow(j, 30)).length;
    const corporateAvailable = state.jobs.some(j => j.source === "corporate" && isJobWithinAgeWindow(j, 30));
    document.getElementById("stat-source-types").textContent = corporateAvailable ? "5" : "4";
    document.getElementById("src-corporate").closest("label").hidden = !corporateAvailable;
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
const allSources = ["jobfind", "kariera", "xe", "direct", "corporate"];

function syncChipUI() {
  const allChecked = allSources.every(s => state.sources.has(s));
  document.getElementById("src-all").checked     = allChecked;
  document.getElementById("src-all").indeterminate = !allChecked && state.sources.size > 0;
  document.getElementById("src-jobfind").checked = state.sources.has("jobfind");
  document.getElementById("src-kariera").checked = state.sources.has("kariera");
  document.getElementById("src-xe").checked      = state.sources.has("xe");
  document.getElementById("src-direct").checked  = state.sources.has("direct");
  document.getElementById("src-corporate").checked = state.sources.has("corporate");
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
    buildCategoryBar();
    updateURL();
    render();
  });
});

// ── Search clear (X) button ──────────────────────────────────────────────────
if (searchClearBtn) {
  searchClearBtn.addEventListener("click", () => {
    state.search = "";
    searchInput.value = "";
    syncPopularChips();
    syncSearchClear();
    buildCategoryBar();
    updateURL();
    render();
    searchInput.focus();
  });
}

// ── Category "all" button (desktop) ──────────────────────────────────────────
categoryBar.querySelector("[data-cat='all']").addEventListener("click", () => toggleCat("all"));

// ── Expandable filters panel ─────────────────────────────────────────────────
filtersToggle.addEventListener("click", () => {
  const opening = advancedFilters.classList.contains("hidden");
  setAdvancedFiltersOpen(opening, filtersToggle);
  if (opening) document.getElementById("advanced-source-heading").focus({preventScroll:true});
});

moreCategoriesBtn.addEventListener("click", () => {
  const opening = advancedFilters.classList.contains("hidden");
  setAdvancedFiltersOpen(opening, moreCategoriesBtn);
  if (opening) document.getElementById("advanced-category-heading").focus({preventScroll:true});
});

filtersDone.addEventListener("click", () => setAdvancedFiltersOpen(false));
advancedFilters.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); setAdvancedFiltersOpen(false); }
});

filtersClear.addEventListener("click", () => {
  state.sources = new Set(allSources);
  state.days = 30;
  state.search = "";
  state.categories.clear();
  searchInput.value = "";

  document.querySelectorAll(".period-tab").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.days) === 30);
  });

  syncChipUI();
  syncCategoryUI();
  syncPopularChips();
  syncSearchClear();
  buildCategoryBar();
  updateURL();
  updateSEO();
  render();
});

// ── Search & Sort ─────────────────────────────────────────────────────────────
searchInput.addEventListener("input", e => {
  state.search = e.target.value.trim();
  syncPopularChips();
  syncSearchClear();
  buildCategoryBar();
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
