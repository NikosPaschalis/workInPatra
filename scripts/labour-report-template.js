export const TEMPLATE_VERSION = 1;
export const ORIGIN = "https://www.workinpatras.gr";
const siteName = "WorkInΠάτρα";
const number = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 });
const signedNumber = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const monthFormat = new Intl.DateTimeFormat("el-GR", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeZone: "Europe/Athens" });
const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = value => String(value).replace(/[&<>"']/g, char => entities[char]);
export const monthLabel = month => monthFormat.format(new Date(`${month}-01T12:00:00Z`));
const dateLabel = date => date ? dateFormat.format(new Date(date)) : "Άγνωστη";
const format = (value, suffix = "", signed = false) => value == null ? "—" : (signed ? signedNumber : number).format(value) + suffix;
const windowLabel = (start, end) => `${monthLabel(start)} – ${monthLabel(end)}`;
const durationLabel = duration => ({ 3: "3 μήνες", 6: "6 μήνες", 12: "12 μήνες" })[duration];
const durationLink = duration => ({ 3: "Τρίμηνη αναφορά", 6: "Εξάμηνη αναφορά", 12: "Δωδεκάμηνη αναφορά" })[duration];
const archiveEntryId = ({ end, duration }) => `edition-${end}-${duration}m`;
const sourceName = ({ key, company }) => ({ kariera: "Kariera", jobfind: "JobFind", xe: "XE" })[key] ?? company ?? "Εταιρική πηγή";

function layout({ title, description, url, article, body }) {
  const fullTitle = `${title} | ${siteName}`;
  const canonical = ORIGIN + url;
  const image = ORIGIN + "/og-image.png";
  const publisher = { "@type": "Organization", name: siteName, url: ORIGIN + "/" };
  const schema = {
    "@context": "https://schema.org", "@type": article ? "Article" : "CollectionPage",
    name: title, url: canonical, description, inLanguage: "el",
    ...(article ? { headline: title, mainEntityOfPage: canonical, author: publisher, publisher, image,
      datePublished: article.publishedAt, dateModified: article.correction?.date ?? article.publishedAt } : {}),
  };
  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(fullTitle)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/report.css">
<meta property="og:type" content="${article ? "article" : "website"}">
<meta property="og:locale" content="el_GR">
<meta property="og:site_name" content="${siteName}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escape(fullTitle)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(fullTitle)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${image}">
<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>
<script src="/report.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Μετάβαση στο περιεχόμενο</a>
<header class="site-header"><div class="container header-inner">
  <a class="logo" href="/">WorkIn<strong>Πάτρα</strong></a>
  <nav aria-label="Κύρια πλοήγηση"><a href="/">Αγγελίες</a><a href="/report.html"${article ? "" : ' aria-current="page"'}>Αναφορές</a></nav>
</div></header>
<main class="container" id="main">
${body}
</main>
<footer class="container site-footer"><a href="/report.html">Αρχείο αναφορών</a><a href="/">Αγγελίες εργασίας στην Πάτρα</a><a href="/privacy.html">Απόρρητο</a></footer>
</body>
</html>
`;
}

function insight(item) {
  switch (item.type) {
    case "inventory":
      return `Το καταγεγραμμένο απόθεμα μεταβλήθηκε από <strong>${format(item.first)} σε ${format(item.latest)} αγγελίες</strong> (${format(item.delta, "", true)}${item.percent === null ? "" : `, ${format(item.percent, "%", true)}`}).`;
    case "sector":
      return `Η μεγαλύτερη απόλυτη μεταβολή κλάδου καταγράφηκε στην κατηγορία <strong>${escape(item.label)}</strong> (${format(item.delta, "", true)} αγγελίες).`;
    case "range":
      return `Οι μηνιαίες καταγραφές κυμάνθηκαν μεταξύ <strong>${format(item.low)} και ${format(item.high)}</strong> αγγελιών.`;
    case "coverage":
      return `Για <strong>${format(item.sources)}</strong> πηγές υπάρχουν πρόσφατες επιτυχείς καταγραφές με ίδια τεκμηριωμένη κάλυψη σε όλη την περίοδο.`;
    default:
      return item.legacy
        ? `Σε <strong>${format(item.legacy)}</strong> μηνιαίες καταγραφές λείπει τεκμηρίωση της τότε κάλυψης. Η σύγκριση κοινών πηγών δεν είναι διαθέσιμη.`
        : "Δεν υπάρχει κοινό σύνολο πηγών με επαρκή και σταθερή τεκμηρίωση για όλη την περίοδο.";
  }
}

function table(caption, headers, rows) {
  return `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption>
<thead><tr>${headers.map(label => `<th scope="col">${escape(label)}</th>`).join("")}</tr></thead>
<tbody>${rows.map(([label, ...values]) => `<tr><th scope="row">${escape(label)}</th>${values.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("\n")}</tbody></table></div>`;
}

function chart(captures, values, label) {
  const max = Math.max(1, ...values.filter(value => value !== null));
  return `<figure class="chart"><figcaption>${escape(label)} · κλίμακα από 0</figcaption><ol>${captures.map((capture, i) => {
    const value = values[i];
    const details = `${monthLabel(capture.month)} · ${value == null ? "άγνωστη τιμή" : `${format(value)} αγγελίες`}`;
    return `<li><span class="bar-point" tabindex="0" aria-label="${escape(details)}"><span class="bar-value" aria-hidden="true">${format(value)}</span><span class="bar" aria-hidden="true" style="--height:${value === null ? 0 : value / max * 100}%"></span><span class="tooltip" aria-hidden="true">${escape(details)}</span></span><span class="month-tick" aria-hidden="true">${capture.month.slice(5)}/${capture.month.slice(2, 4)}</span></li>`;
  }).join("")}</ol></figure>`;
}

function inventorySection({ inventory, captures, window, latestBySource }) {
  const kpis = [
    ["Τελευταία καταγραφή", format(inventory.latest), monthLabel(window.end)],
    ["Μέσο μηνιαίο απόθεμα", format(inventory.average), "Αγγελίες ανά καταγραφή"],
    ["Μεταβολή αποθέματος", format(inventory.delta, "", true), inventory.percent === null ? "Ποσοστό μη διαθέσιμο" : format(inventory.percent, "%", true)],
    ["Μηνιαίες καταγραφές", format(captures.length), `${captures.length} από ${window.duration} μήνες`],
  ];
  return `<section id="inventory"><h2>Εικόνα αγοράς</h2>
<dl class="kpis">${kpis.map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value}<small>${note}</small></dd></div>`).join("")}</dl>
<p>Υψηλότερη καταγραφή ${format(inventory.high.total)} (${monthLabel(inventory.high.month)}). Χαμηλότερη καταγραφή ${format(inventory.low.total)} (${monthLabel(inventory.low.month)}).</p>
${chart(captures, captures.map(capture => capture.total), "Αγγελίες στο συγκεντρωτικό αρχείο")}
${table("Μηνιαίο απόθεμα αγγελιών", ["Μήνας", "Αγγελίες", "Ημερομηνία καταγραφής"], captures.map(c => [monthLabel(c.month), format(c.total), dateLabel(c.capturedAt)]))}
<details><summary>Κατανομή του τελευταίου αποθέματος ανά πηγή</summary>
${table("Πηγές στο συγκεντρωτικό αρχείο", ["Πηγή", "Αγγελίες"], Object.entries(latestBySource).map(([key, value]) => [
  ({ corporate: "Εταιρικές πηγές", unknown: "Άγνωστη πηγή" })[key] ?? sourceName({ key, company: key }), format(value),
]))}<p>Τα σύνολα ανά πηγή περιγράφουν το απόθεμα που διατηρείται στο αρχείο, ανεξάρτητα από το πόσο πρόσφατα ελέγχθηκε κάθε πηγή.</p></details>
</section>`;
}

function sectorSection({ sectors, captures }) {
  const moves = sectors.filter(sector => sector.id !== "unknown" && sector.delta !== null);
  const rise = moves.reduce((best, sector) => sector.delta > (best?.delta ?? 0) ? sector : best, null);
  const fall = moves.reduce((best, sector) => sector.delta < (best?.delta ?? 0) ? sector : best, null);
  const movement = [
    rise && `Μεγαλύτερη αύξηση αποθέματος στην κατηγορία ${escape(rise.label)} (${format(rise.delta, "", true)}).`,
    fall && `Μεγαλύτερη μείωση στην κατηγορία ${escape(fall.label)} (${format(fall.delta, "", true)}).`,
  ].filter(Boolean).join(" ");
  return `<section id="sectors"><h2>Επαγγελματικοί κλάδοι</h2>
<p>${movement || "Δεν υπάρχει καταγεγραμμένη μεταβολή σε κλάδο με πλήρη στοιχεία για την περίοδο."} Οι μεταβολές αφορούν την πρώτη και την τελευταία καταγραφή.</p>
<div class="controls" id="sector-controls" hidden>
<div><label for="sector-filter">Κλάδος</label><select id="sector-filter" aria-controls="sector-table sector-charts"><option value="">Όλοι οι κλάδοι</option>${sectors.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join("")}</select></div>
<div><label for="change-mode">Μονάδα μεταβολής</label><select id="change-mode" aria-controls="sector-table"><option value="both">Αγγελίες και ποσοστά</option><option value="absolute">Αγγελίες</option><option value="relative">Ποσοστά</option></select></div>
</div>
<div id="sector-charts">${sectors.map(s => `<div data-sector-chart="${s.id}" hidden>${chart(captures, s.values, s.label)}</div>`).join("")}</div>
<div class="table-wrap" role="region" aria-label="Μηνιαία κατανομή ανά κλάδο" tabindex="0"><table id="sector-table">
<caption>Μηνιαίες καταγραφές και μεταβολή μεριδίου</caption>
<thead><tr><th scope="col">Κλάδος</th>${captures.map(c => `<th scope="col">${c.month}</th>`).join("")}<th scope="col">Μερίδιο τελευταίου μήνα</th><th scope="col" data-unit="absolute">Διαφορά αγγελιών</th><th scope="col" data-unit="relative">Διαφορά %</th><th scope="col" data-unit="relative">Διαφορά μεριδίου</th></tr></thead>
<tbody>${sectors.map(s => `<tr data-sector="${s.id}"><th scope="row">${escape(s.label)}</th>${s.values.map(value => `<td>${format(value)}</td>`).join("")}<td>${format(s.latestShare, "%")}</td><td data-unit="absolute">${format(s.delta, "", true)}</td><td data-unit="relative">${format(s.percent, "%", true)}</td><td data-unit="relative">${format(s.shareChange, " π.μ.", true)}</td></tr>`).join("\n")}</tbody></table></div>
<p class="small">Η παύλα δηλώνει μη διαθέσιμη τιμή ή σύγκριση. Ποσοστιαίες μεταβολές κλάδων εμφανίζονται όταν και οι δύο ακραίες καταγραφές έχουν τουλάχιστον 5 αγγελίες. Οι π.μ. είναι ποσοστιαίες μονάδες.</p>
</section>`;
}

function corporateSection({ corporate, captures }) {
  return `<section id="employers"><h2>Εταιρικές αγγελίες και εργοδότες</h2>${corporate ?
    `<p>Στην τελευταία καταγραφή, το χωριστό εταιρικό αρχείο περιείχε <strong>${format(corporate.inventory)}</strong> αγγελίες. Στο συγκεντρωτικό απόθεμα περιλαμβάνονται ήδη ${format(corporate.publicInventory)} εταιρικές εγγραφές. Τα δύο μεγέθη επικαλύπτονται και εξετάζονται χωριστά.</p>
<p>Στο εταιρικό αρχείο, ${format(corporate.unverified)} εγγραφές είχαν εκκρεμή επιβεβαίωση. ${corporate.coverageChanged === null ? "Η μεταβολή κάλυψης δεν μπορεί ακόμη να τεκμηριωθεί για όλη την περίοδο." : corporate.coverageChanged ? "Το σύνολο των εταιρικών πηγών με πρόσφατη επιτυχή καταγραφή άλλαξε μέσα στην περίοδο." : "Το σύνολο των εταιρικών πηγών με πρόσφατη επιτυχή καταγραφή παρέμεινε σταθερό."}</p>
${table("Κατανομή ανά εργοδότη", ["Εργοδότης", "Αγγελίες"], corporate.byCompany.map(([name, value]) => [name === "unknown" ? "Άγνωστος" : name, format(value)]))}
${table("Κατανομή ανά επαγγελματική κατηγορία", ["Κατηγορία", "Αγγελίες"], corporate.byCategory.map(([name, value]) => [name === "unknown" ? "Άγνωστη" : name, format(value)]))}
${table("Κάλυψη εταιρικών πηγών", ["Μήνας", "Πηγές με πρόσφατη επιτυχή καταγραφή"], corporate.coverageCounts.map((value, i) => [monthLabel(captures[i].month), format(value)]))}`
    : "<p>Δεν υπάρχει επαρκής τεκμηριωμένη εταιρική καταγραφή για παρουσίαση. Η διεύρυνση της κάλυψης σε νέους εργοδότες μπορεί να αλλάξει το παρατηρούμενο μέγεθος.</p>"}</section>`;
}

function methods({ coverage, captures, window, edition }) {
  return `<section id="method"><h2>Ποιότητα δεδομένων και μεθοδολογία</h2>
<p>Η περίοδος περιλαμβάνει ${window.duration} διαδοχικούς μήνες. Η καταγραφή γίνεται στις αρχές του επόμενου μήνα και μετρά τις αγγελίες που διατηρούνται στο αρχείο εκείνη τη στιγμή. Ο μέσος όρος είναι μέσος όρος αποθεμάτων. Μεταβολές στη σύνθεση των πηγών, στην κάλυψη και στην ταξινόμηση επηρεάζουν τις τιμές. Τα στοιχεία καλύπτουν τις πηγές του WorkInΠάτρα και μόνο.</p>
${table("Καταγραφή και ενημέρωση του αρχείου", ["Μήνας", "Καταγραφή", "Τελευταία ενημέρωση αρχείου", "Πρόσφατες πηγές", "Λοιπές πηγές", "Πηγές με ελλιπείς ημερομηνίες"], captures.map(c => [monthLabel(c.month), dateLabel(c.capturedAt), dateLabel(c.lastFetched), format(c.freshSources), format(c.otherSources), format(c.missingDateSources)]))}
<h3>Σύγκριση κοινών πηγών</h3>
${coverage.series.length ? table("Πρόσφατες παρατηρήσεις ανά κοινή πηγή", ["Πηγή", ...captures.map(c => c.month), "Διαφορά", "Διαφορά %"], coverage.series.map(s => [sourceName(s), ...s.values.map(v => format(v)), format(s.delta, "", true), format(s.percent, "%", true)])) : "<p>Δεν είναι διαθέσιμη σύγκριση πηγών με τεκμηριωμένη, κοινή κάλυψη σε όλους τους μήνες.</p>"}
<p>Για τη σύγκριση χρειάζονται ίδια τεκμηριωμένη κάλυψη και μέθοδος, καθώς και επιτυχής καταγραφή εντός 36 ωρών σε κάθε μήνα. Πηγές εκτός σύγκρισης με καταγεγραμμένες ενδείξεις: ${format(coverage.excluded.length)}. Όπου λείπει τεκμηρίωση, οι μετρήσεις κάλυψης παραμένουν άγνωστες. Καταχωρίσεις που διατηρήθηκαν από παλαιότερη συλλογή μπορεί να περιλαμβάνονται στο απόθεμα, ενώ οι παρατηρήσεις κοινών πηγών μετρούν μόνο πρόσφατες καταγραφές.</p>
<p>Η ενοποίηση διπλοεγγραφών βασίζεται στα διαθέσιμα γνωρίσματα των αγγελιών. Ίδιες θέσεις σε διαφορετικές πηγές μπορεί να παραμείνουν χωριστές. Η ημερομηνία καταγραφής και η ημερομηνία δημοσίευσης στην πηγή έχουν διαφορετική σημασία. Μια ελλιπής ή μη επιβεβαιωμένη ημερομηνία δεν συμπληρώνεται στην αναφορά.</p>
<details><summary>Πηγές και στοιχεία έκδοσης</summary><ul>${captures.map(c => `<li><a href="/data/snapshots/${c.month}.json">Μηνιαία καταγραφή ${monthLabel(c.month)}</a></li>`).join("")}</ul>
<p><a href="${edition.url}report.json">Δεδομένα έκδοσης (JSON)</a> · Μεθοδολογία ${edition.methodologyVersion} · Πρότυπο ${edition.templateVersion} · Έκδοση ${edition.revision}</p></details>
</section>`;
}

export function renderEdition(report) {
  const { window, edition } = report;
  const period = windowLabel(window.start, window.end);
  const revision = edition.revision === 1 ? "" : ` · Αναθεώρηση ${edition.revision}`;
  const title = `Αγορά εργασίας στην Πάτρα και την Αχαΐα · ${period} (${durationLabel(window.duration)})${revision}`;
  const description = `Καταγεγραμμένες αγγελίες εργασίας στην Πάτρα και την Αχαΐα, ${period}. ${format(report.inventory.latest)} αγγελίες στην τελευταία καταγραφή. Κλάδοι, κάλυψη και μεθοδολογία.${revision}`;
  return layout({ title, description, url: edition.url, article: edition, body: `
<article>
<header class="report-intro"><a class="back" href="/report.html">← Όλες οι περίοδοι</a>
<h1>Αγορά εργασίας στην Πάτρα και την Αχαΐα</h1>
<p class="lede">${period} · ${durationLabel(window.duration)}${revision}</p>
<p class="edition-link"><a href="/report.html#${archiveEntryId(window)}" data-edition-url="${edition.url}">Τρέχουσα έκδοση και διορθώσεις</a></p>
${edition.correction ? `<p class="notice">Διόρθωση ${dateLabel(edition.correction.date)}. ${escape(edition.correction.reason)} <a href="${edition.correction.previousUrl}">Προηγούμενη έκδοση</a>.</p>` : ""}
</header>
<section class="executive" aria-labelledby="summary"><h2 id="summary">Σύνοψη</h2><ul>${report.insights.map(item => `<li>${insight(item)}</li>`).join("")}</ul>
<p>Οι μεταβολές αφορούν το αρχείο του WorkInΠάτρα. Η συνολική ζήτηση εργασίας και οι νέες δημοσιεύσεις κάθε μήνα απαιτούν διαφορετικά στοιχεία.</p></section>
<nav class="contents" aria-label="Περιεχόμενα αναφοράς"><a href="#inventory">Απόθεμα</a><a href="#sectors">Κλάδοι</a><a href="#employers">Εργοδότες</a><a href="#history">Ιστορικό</a><a href="#method">Μεθοδολογία</a></nav>
${inventorySection(report)}
${sectorSection(report)}
${corporateSection(report)}
<section id="history"><h2>Ιστορικό και κύκλος ζωής</h2><p>Οι μηνιαίες καταγραφές δείχνουν το απόθεμα. Το διαθέσιμο ιστορικό δεν στηρίζει ακόμη συγκρίσιμους δείκτες για νέους εντοπισμούς, επανεμφανίσεις ή διάρκεια. Ο πρώτος εντοπισμός δεν τεκμηριώνει την ημερομηνία δημοσίευσης. Η τελευταία παρατήρηση ή η απουσία μιας αγγελίας δεν τεκμηριώνει κλείσιμο θέσης ή πρόσληψη.</p></section>
${methods(report)}
</article>` });
}

export function renderArchive(windows, entries) {
  return layout({
    title: "Αναφορές αγοράς εργασίας στην Πάτρα και την Αχαΐα",
    description: "Αναφορές 3, 6 και 12 μηνών για τις καταγεγραμμένες αγγελίες στην Πάτρα και την Αχαΐα. Ιστορικές εκδόσεις, επαγγελματικοί κλάδοι και μεθοδολογία.",
    url: "/report.html",
    body: `
<header class="report-intro"><h1>Η αγορά εργασίας στην Πάτρα και την Αχαΐα</h1>
<p class="lede">Στατιστικά για τις αγγελίες εργασίας στην Πάτρα και την Αχαΐα, με μηνιαίες εκδόσεις και συγκρίσεις ανά επαγγελματικό κλάδο.</p>
<p>Δείτε πώς μεταβάλλεται ο αριθμός των καταγεγραμμένων αγγελιών, ποιοι κλάδοι εμφανίζονται στις μηνιαίες καταγραφές και ποια είναι τα όρια των διαθέσιμων δεδομένων. Οι αναφορές δεν αποτελούν απογραφή όλων των θέσεων εργασίας της περιοχής. Αναζητάτε δουλειά; <a href="/">Δείτε τις διαθέσιμες αγγελίες εργασίας στην Πάτρα</a>.</p></header>
<section aria-labelledby="latest"><h2 id="latest">Τελευταίες περίοδοι</h2>
<p>Κάθε αναφορά μετρά το απόθεμα αγγελιών σε διαδοχικές μηνιαίες καταγραφές. Η ημερομηνία δίπλα σε κάθε καταγραφή δείχνει πότε έγινε η μέτρηση.</p>
<div class="period-grid">${windows.map(window => `<article class="period-card"><h3>${durationLabel(window.duration)}</h3><p>${window.start ? windowLabel(window.start, window.end) : "Αναμένονται μηνιαίες καταγραφές"}</p>
${window.latest ? `<p class="period-value">${format(window.latest.inventory)} αγγελίες</p><p>${escape(window.latest.summary)}</p><a href="${window.latest.url}">${durationLink(window.duration)}</a>` :
  `<p><strong>Ανεπαρκή δεδομένα</strong></p><p>${window.available} από ${window.duration} απαιτούμενες καταγραφές.${window.missing.length ? ` Λείπουν οι εξής μήνες: ${window.missing.map(monthLabel).join(", ")}.` : ""}</p>`}</article>`).join("")}</div></section>
<section aria-labelledby="archive"><h2 id="archive">Αρχείο εκδόσεων</h2>
<div class="controls" id="archive-controls" hidden><div><label for="archive-duration">Διάρκεια</label><select id="archive-duration" aria-controls="archive-list"><option value="">Όλες</option>${windows.map(window => `<option value="${window.duration}">${durationLabel(window.duration)}</option>`).join("")}</select></div></div>
<ul class="archive-list" id="archive-list">${entries.map(entry => {
  const current = entry.revisions.at(-1);
  return `<li id="${archiveEntryId(entry)}" data-duration="${entry.duration}"><a href="${current.url}">${windowLabel(entry.start, entry.end)} · ${durationLabel(entry.duration)}</a>${current.correction ? `<p>Έκδοση ${current.revision} · Διόρθωση ${dateLabel(current.correction.date)}. ${escape(current.correction.reason)}</p>` : ""}${entry.revisions.length > 1 ? `<details><summary>Προηγούμενες εκδόσεις</summary><ul>${entry.revisions.slice(0, -1).map(revision => `<li><a href="${revision.url}">Έκδοση ${revision.revision}</a></li>`).join("")}</ul></details>` : ""}</li>`;
}).join("")}</ul>
<p id="archive-empty"${entries.length ? " hidden" : ""} role="status">Δεν υπάρχει έκδοση για αυτή τη διάρκεια.</p></section>`,
  });
}

export function archiveSummary(report) {
  return `Η διαφορά μεταξύ πρώτης και τελευταίας καταγραφής ήταν ${format(report.inventory.delta, "", true)} αγγελίες.`;
}
