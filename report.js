import { CATEGORY_DEFINITIONS } from './categories.js';

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_DEFINITIONS.map(({ id, label }) => [id, label]));
const SOURCE_LABELS = { jobfind: 'JobFind', kariera: 'Kariera', xe: 'XE', unknown: 'Άγνωστη πηγή' };
const statusEl = document.getElementById('report-status');
const contentEl = document.getElementById('report-content');
const numberFormat = new Intl.NumberFormat('el-GR');
const monthFormat = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateFormat = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function formatMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return monthFormat.format(new Date(Date.UTC(year, m - 1, 1)));
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
}
function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function renderTrend(snapshots) {
  const host = document.getElementById('trend-chart');
  const width = 620, height = 245, left = 42, right = 18, top = 18, bottom = 42;
  const values = snapshots.map(item => item.total);
  const max = Math.max(1, ...values);
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = i => snapshots.length === 1 ? left + plotW / 2 : left + i * plotW / (snapshots.length - 1);
  const y = value => top + plotH - (value / max) * plotH;
  const grid = [0, .5, 1].map(fraction => {
    const value = Math.round(max * fraction), yy = y(value);
    return '<line x1="' + left + '" y1="' + yy + '" x2="' + (width-right) + '" y2="' + yy + '" stroke="#eeedf4"/><text x="' + (left-9) + '" y="' + (yy+4) + '" text-anchor="end" fill="#85859a" font-size="11">' + value + '</text>';
  }).join('');
  const points = snapshots.map((item, i) => x(i) + ',' + y(item.total)).join(' ');
  const circles = snapshots.map((item, i) => '<circle cx="' + x(i) + '" cy="' + y(item.total) + '" r="4.5" fill="#4f46e5" stroke="white" stroke-width="2"><title>' + escapeText(formatMonth(item.month) + ': ' + item.total + ' αγγελίες') + '</title></circle>').join('');
  const labels = snapshots.map((item, i) => '<text x="' + x(i) + '" y="' + (height-15) + '" text-anchor="middle" fill="#77778b" font-size="11">' + escapeText(item.month.slice(5)) + '/' + escapeText(item.month.slice(2,4)) + '</text>').join('');
  const valueLabels = snapshots.map((item, i) => '<text x="' + x(i) + '" y="' + (y(item.total)-11) + '" text-anchor="middle" fill="#282747" font-size="12" font-weight="700">' + item.total + '</text>').join('');
  host.innerHTML = '<svg class="trend-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Εξέλιξη συνόλου αγγελιών: ' + snapshots.map(s => escapeText(formatMonth(s.month) + ' ' + s.total)).join(', ') + '">' + grid + '<polyline points="' + points + '" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + circles + valueLabels + labels + '</svg>';
}
function renderBreakdown(snapshot, type) {
  const host = document.getElementById('breakdown-chart');
  document.getElementById('breakdown-title').textContent = type === 'category' ? 'Κατανομή ανά κατηγορία' : 'Κατανομή ανά πηγή';
  document.getElementById('breakdown-subtitle').textContent = 'Snapshot ' + formatMonth(snapshot.month);
  const raw = type === 'category' ? snapshot.byCategory : snapshot.bySource;
  const labels = type === 'category' ? CATEGORY_LABELS : SOURCE_LABELS;
  const rows = Object.entries(raw || {}).map(([id, value]) => ({ label: labels[id] || id, value: Number(value) || 0 }))
    .filter(row => type === 'category' || row.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'el'));
  if (!rows.length) { host.innerHTML = '<div class="chart-empty">Δεν υπάρχουν αναλυτικά στοιχεία.</div>'; return; }
  const max = Math.max(...rows.map(row => row.value), 1);
  host.innerHTML = rows.map(row => '<div class="bar-row"><div class="bar-label">' + escapeText(row.label) + '</div><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:' + (row.value/max*100) + '%"></div></div><div class="bar-value">' + numberFormat.format(row.value) + '</div></div>').join('');
}
function renderHistory(snapshots) {
  document.getElementById('history-rows').innerHTML = snapshots.map((snapshot, index) => {
    const previous = snapshots[index - 1];
    const change = previous ? percentChange(snapshot.total, previous.total) : null;
    const text = change === null ? '—' : (change > 0 ? '+' : '') + change.toLocaleString('el-GR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%';
    const cls = change === null ? '' : change > 0 ? 'positive' : change < 0 ? 'negative' : '';
    return '<tr class="' + (index === snapshots.length - 1 ? 'latest' : '') + '"><td>' + escapeText(formatMonth(snapshot.month)) + '</td><td class="num">' + numberFormat.format(snapshot.total) + '</td><td class="num ' + cls + '">' + text + '</td><td>' + escapeText(formatDate(snapshot.capturedAt)) + '</td></tr>';
  }).join('');
}
async function loadReport() {
  try {
    const response = await fetch('/data/snapshots/index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Το αρχείο ιστορικών δεδομένων δεν είναι διαθέσιμο.');
    const manifest = await response.json();
    const entries = Array.isArray(manifest.snapshots) ? manifest.snapshots : [];
    const snapshots = (await Promise.all(entries.map(async entry => {
      const res = await fetch('/data/snapshots/' + encodeURIComponent(entry.file), { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.month && Number.isFinite(Number(data.total)) ? data : null;
    }))).filter(Boolean).sort((a, b) => a.month.localeCompare(b.month));
    if (!snapshots.length) throw new Error('Δεν βρέθηκαν έγκυρα ιστορικά δεδομένα.');
    const latest = snapshots[snapshots.length - 1], previous = snapshots[snapshots.length - 2];
    document.getElementById('kpi-total').textContent = numberFormat.format(latest.total);
    document.getElementById('kpi-month').textContent = 'Snapshot: ' + formatMonth(latest.month);
    const change = previous ? percentChange(latest.total, previous.total) : null;
    const changeEl = document.getElementById('kpi-change'), note = document.getElementById('kpi-change-note');
    if (change === null) { changeEl.textContent = '—'; note.textContent = 'Χρειάζονται τουλάχιστον δύο snapshots για σύγκριση.'; }
    else {
      changeEl.textContent = (change > 0 ? '+' : '') + change.toLocaleString('el-GR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%';
      changeEl.classList.toggle('positive', change > 0); changeEl.classList.toggle('negative', change < 0);
      note.textContent = numberFormat.format(latest.total - previous.total) + ' αγγελίες σε σχέση με ' + formatMonth(previous.month);
    }
    renderTrend(snapshots); renderBreakdown(latest, document.getElementById('breakdown-type').value); renderHistory(snapshots);
    document.getElementById('breakdown-type').addEventListener('change', event => renderBreakdown(latest, event.target.value));
    document.getElementById('data-freshness').textContent = 'Τελευταία λήψη στο πιο πρόσφατο snapshot: ' + formatDate(latest.lastFetched) + '. Τα στοιχεία ανανεώνονται όταν δημιουργείται νέο μηνιαίο snapshot.';
    contentEl.hidden = false; statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : 'Δεν ήταν δυνατή η φόρτωση της αναφοράς.';
  }
}
loadReport();
