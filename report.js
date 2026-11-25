const archiveDuration = document.querySelector("#archive-duration");
if (archiveDuration) {
  const entries = [...document.querySelectorAll("#archive-list > li")];
  document.querySelector("#archive-controls").hidden = false;
  const filterArchive = () => {
    for (const entry of entries) {
      entry.hidden = Boolean(archiveDuration.value) && entry.dataset.duration !== archiveDuration.value;
    }
    document.querySelector("#archive-empty").hidden = entries.some(entry => !entry.hidden);
  };
  archiveDuration.addEventListener("change", filterArchive);
  filterArchive();
}

const editionLink = document.querySelector("[data-edition-url]");
if (editionLink) {
  fetch("/reports/index.json")
    .then(response => response.ok ? response.json() : null)
    .then(archive => {
      const url = editionLink.dataset.editionUrl;
      const entry = archive?.entries.find(item => item.revisions.some(revision => revision.url === url));
      const latest = entry?.revisions.at(-1);
      if (latest && latest.url !== url) {
        editionLink.textContent = "Διατίθεται διορθωμένη έκδοση στο αρχείο";
        editionLink.parentElement.classList.add("notice");
      }
    })
    .catch(() => {
      // The permanent archive link still works when the index cannot be fetched.
    });
}

const sectorFilter = document.querySelector("#sector-filter");
if (sectorFilter) {
  const rows = [...document.querySelectorAll("#sector-table [data-sector]")];
  const charts = [...document.querySelectorAll("[data-sector-chart]")];
  const changeMode = document.querySelector("#change-mode");
  const units = [...document.querySelectorAll("#sector-table [data-unit]")];
  document.querySelector("#sector-controls").hidden = false;
  const filterSectors = () => {
    for (const row of rows) row.hidden = Boolean(sectorFilter.value) && row.dataset.sector !== sectorFilter.value;
    for (const chart of charts) chart.hidden = chart.dataset.sectorChart !== sectorFilter.value;
  };
  const filterUnits = () => {
    for (const cell of units) cell.hidden = changeMode.value !== "both" && cell.dataset.unit !== changeMode.value;
  };
  sectorFilter.addEventListener("change", filterSectors);
  changeMode.addEventListener("change", filterUnits);
  filterSectors();
  filterUnits();
}
