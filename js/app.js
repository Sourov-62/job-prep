/* app.js — মূল অ্যাপ্লিকেশন লজিক (SPA, কোনো ফ্রেমওয়ার্ক ছাড়া) */

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SECTOR_PALETTE = [
  "#d9a441", "#4fa88f", "#6f9bd1", "#e0665a",
  "#a488d9", "#5cb3c9", "#c98f5c", "#7fb069",
];

const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
const EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const BN_WEEKDAYS = ["রবি","সোম","মঙ্গল","বুধ","বৃহস্পতি","শুক্র","শনি"];
const EN_WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];

function isBn() { return LangState.current === "bn"; }

function toNum(n) {
  return isBn() ? String(n).replace(/\d/g, (d) => BN_DIGITS[d]) : String(n);
}
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return dateStr;
  const months = isBn() ? BN_MONTHS : EN_MONTHS;
  return isBn()
    ? `${toNum(d.getDate())} ${months[d.getMonth()]}, ${toNum(d.getFullYear())}`
    : `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}
function detectLang(text) {
  return /[\u0980-\u09FF]/.test(text || "") ? "bn" : "en";
}

const state = {
  sectors: [],
  currentView: { type: "dashboard" },
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  folderStack: [], // {id, name} breadcrumb for courses tab, reset per sector
};

function toast(msg) {
  const t2 = qs("#toast");
  t2.textContent = msg;
  t2.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t2.classList.remove("show"), 2400);
}

function sectorColor(sector) {
  const idx = state.sectors.findIndex((s) => s.id === sector.id);
  return sector.color || SECTOR_PALETTE[idx % SECTOR_PALETTE.length] || SECTOR_PALETTE[0];
}

function speakBtn(text, extraStyle = "") {
  if (!TTS.supported) return "";
  const id = "spk_" + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", (e) => {
      e.stopPropagation();
      TTS.speak(text, detectLang(text));
    });
  }, 0);
  return `<button class="speak-btn" id="${id}" style="${extraStyle}" title="${t("common_readAloud")}">🔊</button>`;
}

/* ===================== Subject / Topic taxonomy (syllabus tracking) =====================
   "কোর্স ও টপিক" ট্যাবের ফোল্ডার-কাঠামোকেই সাবজেক্ট/টপিক হিসেবে ব্যবহার করা হয়:
   সেক্টরের সরাসরি সন্তান ফোল্ডার = সাবজেক্ট, তার সন্তান ফোল্ডার = টপিক।
   এভাবে ডায়েরি/স্টিকি নোট/ফোকাস/রুটিন — সবখানে Sector → Subject → Topic
   ধারাবাহিকভাবে ব্যবহার করা যায়, এবং কোন টপিক শেষ হলো তা থেকে
   প্রতিটি সাবজেক্ট ও সেক্টরের সিলেবাস অগ্রগতি হিসাব করা যায়। */

async function getSubjects(sectorId) {
  if (!sectorId) return [];
  const folders = await DB.byIndex(DB.STORES.folders, "sectorId", sectorId);
  return folders.filter((f) => !f.parentId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
async function getTopics(subjectId) {
  if (!subjectId) return [];
  const folders = await DB.byIndex(DB.STORES.folders, "parentId", subjectId);
  return folders.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
async function markTopicCompleted(topicId, completed) {
  if (!topicId) return;
  const folder = await DB.get(DB.STORES.folders, topicId);
  if (!folder) return;
  folder.completed = completed;
  await DB.put(DB.STORES.folders, folder);
}

/* একটা reusable sector→subject→topic cascading select group বানায়।
   sectorFixed=true হলে সেক্টর select দেখানো হয় না (যেমন: একটা সেক্টরের ভেতরের মডাল)। */
function cascadeSelectHTML(prefix, { sectorFixed = false, sectorId = "" } = {}) {
  const sectorRow = sectorFixed ? "" : `
    <select id="${prefix}Sector">
      <option value="">${t("cascade_sector")}…</option>
      ${state.sectors.map((s) => `<option value="${s.id}" ${s.id === sectorId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
    </select>`;
  return `
    <div class="cascade-row" id="${prefix}Wrap" data-sector-fixed="${sectorFixed ? "1" : ""}" data-fixed-sector-id="${sectorId || ""}">
      ${sectorRow}
      <select id="${prefix}Subject"><option value="">${t("cascade_noSubject")}</option></select>
      <select id="${prefix}Topic"><option value="">${t("cascade_noTopic")}</option></select>
      <div class="field-hint">${t("cascade_hint")}</div>
    </div>`;
}

/* cascadeSelectHTML দিয়ে তৈরি selects গুলোতে change listener বসায়, যাতে
   সেক্টর পাল্টালে সাবজেক্ট-লিস্ট ও সাবজেক্ট পাল্টালে টপিক-লিস্ট রিফ্রেশ হয়। */
function wireCascadeSelect(prefix, { initialSectorId = "", initialSubjectId = "", initialTopicId = "" } = {}) {
  const wrap = qs(`#${prefix}Wrap`);
  if (!wrap) return;
  const sectorFixed = wrap.dataset.sectorFixed === "1";
  const fixedSectorId = wrap.dataset.fixedSectorId;
  const sectorSel = sectorFixed ? null : qs(`#${prefix}Sector`);
  const subjectSel = qs(`#${prefix}Subject`);
  const topicSel = qs(`#${prefix}Topic`);

  async function refreshSubjects(sectorId, keepSubjectId) {
    subjectSel.innerHTML = `<option value="">${t("cascade_noSubject")}</option>`;
    topicSel.innerHTML = `<option value="">${t("cascade_noTopic")}</option>`;
    if (!sectorId) return;
    const subjects = await getSubjects(sectorId);
    subjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id; opt.textContent = s.name;
      if (s.id === keepSubjectId) opt.selected = true;
      subjectSel.appendChild(opt);
    });
  }
  async function refreshTopics(subjectId, keepTopicId) {
    topicSel.innerHTML = `<option value="">${t("cascade_noTopic")}</option>`;
    if (!subjectId) return;
    const topics = await getTopics(subjectId);
    topics.forEach((tp) => {
      const opt = document.createElement("option");
      opt.value = tp.id; opt.textContent = tp.name + (tp.completed ? " ✓" : "");
      if (tp.id === keepTopicId) opt.selected = true;
      topicSel.appendChild(opt);
    });
  }

  if (sectorSel) {
    sectorSel.addEventListener("change", () => refreshSubjects(sectorSel.value, ""));
  }
  subjectSel.addEventListener("change", () => refreshTopics(subjectSel.value, ""));

  const startSectorId = sectorFixed ? fixedSectorId : (initialSectorId || (sectorSel ? sectorSel.value : ""));
  refreshSubjects(startSectorId, initialSubjectId).then(() => {
    if (initialSubjectId) refreshTopics(initialSubjectId, initialTopicId);
  });
}

function cascadeValues(prefix) {
  const wrap = qs(`#${prefix}Wrap`);
  const sectorFixed = wrap.dataset.sectorFixed === "1";
  const sectorId = sectorFixed ? wrap.dataset.fixedSectorId : (qs(`#${prefix}Sector`)?.value || null);
  return {
    sectorId: sectorId || null,
    subjectId: qs(`#${prefix}Subject`)?.value || null,
    topicId: qs(`#${prefix}Topic`)?.value || null,
  };
}

async function lookupSubjectTopicNames(subjectId, topicId) {
  const names = {};
  if (subjectId) { const s = await DB.get(DB.STORES.folders, subjectId); names.subject = s ? s.name : null; }
  if (topicId) { const tp = await DB.get(DB.STORES.folders, topicId); names.topic = tp ? tp.name : null; }
  return names;
}

/* ===================== Accent color customization ===================== */
const ACCENT_PRESETS = ["#d9a441", "#4fa88f", "#6f9bd1", "#e0665a", "#a488d9", "#5cb3c9", "#7fb069"];
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function currentAccent() {
  return localStorage.getItem("jobprep_accent") || "#d9a441";
}
function applyAccent(color) {
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-soft", hexToRgba(color, 0.15));
  localStorage.setItem("jobprep_accent", color);
}

/* ===================== Background photo (blended/transparent) ===================== */
let bgPhotoObjectUrl = null;
function currentBgOpacity() {
  return parseInt(localStorage.getItem("jobprep_bg_opacity") || "12", 10);
}
function applyBgOpacity(pct) {
  qs("#bgPhotoLayer").style.opacity = String(Math.max(0, Math.min(40, pct)) / 100);
  localStorage.setItem("jobprep_bg_opacity", String(pct));
}
async function loadBackgroundPhoto() {
  try {
    const row = await DB.get(DB.STORES.settings, "bgImage");
    if (row && row.value instanceof Blob) {
      if (bgPhotoObjectUrl) URL.revokeObjectURL(bgPhotoObjectUrl);
      bgPhotoObjectUrl = URL.createObjectURL(row.value);
      qs("#bgPhotoLayer").style.backgroundImage = `url(${bgPhotoObjectUrl})`;
      applyBgOpacity(currentBgOpacity());
    }
  } catch (e) { /* কোনো ছবি সেট করা নেই */ }
}
async function setBackgroundPhoto(file) {
  await DB.put(DB.STORES.settings, { key: "bgImage", value: file });
  await loadBackgroundPhoto();
}
async function clearBackgroundPhoto() {
  await DB.delete(DB.STORES.settings, "bgImage");
  if (bgPhotoObjectUrl) { URL.revokeObjectURL(bgPhotoObjectUrl); bgPhotoObjectUrl = null; }
  const layer = qs("#bgPhotoLayer");
  layer.style.backgroundImage = "none";
  layer.style.opacity = "0";
}

/* ===================== Modal helper ===================== */
function openModal(html, { wide = false } = {}) {
  const box = qs("#modalBox");
  box.className = "modal-box" + (wide ? " wide" : "");
  box.innerHTML = html;
  qs("#modalOverlay").classList.remove("hidden");
}
function closeModal() {
  qs("#modalOverlay").classList.add("hidden");
  qs("#modalBox").innerHTML = "";
}
qs("#modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

/* ===================== Clock ===================== */
function tickClock() {
  const now = new Date();
  const hh = toNum(String(now.getHours()).padStart(2, "0"));
  const mm = toNum(String(now.getMinutes()).padStart(2, "0"));
  qs("#clockTime").textContent = `${hh}:${mm}`;
  const wd = isBn() ? BN_WEEKDAYS[now.getDay()] + "বার" : EN_WEEKDAYS[now.getDay()];
  const months = isBn() ? BN_MONTHS : EN_MONTHS;
  qs("#clockDate").textContent = isBn()
    ? `${wd}, ${toNum(now.getDate())} ${months[now.getMonth()]} ${toNum(now.getFullYear())}`
    : `${wd}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}
setInterval(tickClock, 1000 * 20);

/* ===================== Theme & Language ===================== */
const THEMES = ["dark", "light", "sepia"];
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("jobprep_theme", theme);
}
function currentTheme() {
  return localStorage.getItem("jobprep_theme") || "dark";
}

function applyStaticI18n() {
  qsa("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  qsa("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  qs("#langToggleBtn").textContent = t("lang_toggle_label");
  document.documentElement.lang = LangState.current;
}

function setLanguage(lang) {
  LangState.set(lang);
  applyStaticI18n();
  applyFocusDockLabels();
  tickClock();
  renderSidebar();
  rerenderCurrentView();
}

qs("#langToggleBtn").addEventListener("click", () => {
  setLanguage(isBn() ? "en" : "bn");
});

function rerenderCurrentView() {
  switch (state.currentView.type) {
    case "dashboard": return renderDashboard();
    case "sector": return renderSectorView();
    case "settings": return renderSettingsView();
    case "stickyNotes": return renderStickyNotesView();
    case "diary": return renderDiaryView();
    case "dictionary": return renderDictionaryView();
  }
}

/* ===================== Sidebar ===================== */
async function refreshSectors() {
  state.sectors = (await DB.all(DB.STORES.sectors)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderSidebar() {
  const list = qs("#sectorNavList");
  list.innerHTML = "";
  state.sectors.forEach((s) => {
    const el = document.createElement("div");
    el.className = "sector-nav-item" + (state.currentView.type === "sector" && state.currentView.sectorId === s.id ? " active" : "");
    el.innerHTML = `<span class="sector-dot" style="background:${sectorColor(s)}"></span><span class="sector-nav-name">${escapeHtml(s.name)}</span>`;
    el.addEventListener("click", () => navigateSector(s.id));
    list.appendChild(el);
  });

  qs("#navDashboard").classList.toggle("active", state.currentView.type === "dashboard");
  qs("#navSettings").classList.toggle("active", state.currentView.type === "settings");
  qs("#navStickyNotes").classList.toggle("active", state.currentView.type === "stickyNotes");
  qs("#navDiary").classList.toggle("active", state.currentView.type === "diary");
  qs("#navDictionary").classList.toggle("active", state.currentView.type === "dictionary");
  syncMobileBottomNavActive();
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

qs("#navDashboard").addEventListener("click", () => navigateDashboard());
qs("#navSettings").addEventListener("click", () => navigateSettings());
qs("#navStickyNotes").addEventListener("click", () => navigateStickyNotes());
qs("#navDiary").addEventListener("click", () => navigateDiary());
qs("#navDictionary").addEventListener("click", () => navigateDictionary());
qs("#btnAddSector").addEventListener("click", () => openSectorFormModal());

/* ===================== Sector CRUD ===================== */
function openSectorFormModal(existing = null) {
  const isEdit = !!existing;
  openModal(`
    <h3 class="modal-title">${isEdit ? t("sector_formTitleEdit") : t("sector_formTitleNew")}</h3>
    <div class="form-row">
      <label>${t("sector_name")}</label>
      <input type="text" id="sectorNameInput" value="${isEdit ? escapeHtml(existing.name) : ""}" placeholder="${t("sector_namePh")}" />
    </div>
    <div class="form-row">
      <label>${t("sector_desc")}</label>
      <textarea id="sectorDescInput" rows="2" placeholder="${t("sector_descPh")}">${isEdit ? escapeHtml(existing.description || "") : ""}</textarea>
    </div>
    <div class="form-row">
      <label>${t("sector_color")}</label>
      <div id="colorPicker" style="display:flex;gap:8px;flex-wrap:wrap;">
        ${SECTOR_PALETTE.map((c) => `<span data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${existing && existing.color === c ? "#fff" : "transparent"};display:inline-block;"></span>`).join("")}
      </div>
    </div>
    <div class="form-actions">
      ${isEdit ? `<button class="btn btn-danger" id="btnDeleteSector">${t("sector_deleteBtn")}</button>` : ""}
      <button class="btn btn-ghost" id="btnCancelSector">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="btnSaveSector">${t("common_save")}</button>
    </div>
  `);

  let chosenColor = existing?.color || null;
  qsa("#colorPicker span").forEach((sp) => {
    sp.addEventListener("click", () => {
      chosenColor = sp.dataset.color;
      qsa("#colorPicker span").forEach((s2) => (s2.style.border = "2px solid transparent"));
      sp.style.border = "2px solid #fff";
    });
  });

  qs("#btnCancelSector").addEventListener("click", closeModal);
  qs("#btnSaveSector").addEventListener("click", async () => {
    const name = qs("#sectorNameInput").value.trim();
    if (!name) { toast(t("sector_nameRequired")); return; }
    const sector = existing || { id: uid(), createdAt: Date.now(), order: state.sectors.length };
    sector.name = name;
    sector.description = qs("#sectorDescInput").value.trim();
    if (chosenColor) sector.color = chosenColor;
    await DB.put(DB.STORES.sectors, sector);
    await refreshSectors();
    renderSidebar();
    closeModal();
    toast(isEdit ? t("sector_updated") : t("sector_added"));
    if (!isEdit) navigateSector(sector.id);
    else if (state.currentView.type === "sector" && state.currentView.sectorId === sector.id) renderSectorView();
  });

  if (isEdit) {
    qs("#btnDeleteSector").addEventListener("click", async () => {
      if (!confirm(`"${existing.name}" — ${t("sector_deleteConfirm")}`)) return;
      await deleteSectorCascade(existing.id);
      closeModal();
      await refreshSectors();
      renderSidebar();
      navigateDashboard();
      toast(t("sector_deleted"));
    });
  }
}

async function deleteSectorCascade(sectorId) {
  const [resources, jobs, routine, logs, folders, notes] = await Promise.all([
    DB.byIndex(DB.STORES.resources, "sectorId", sectorId),
    DB.byIndex(DB.STORES.jobs, "sectorId", sectorId),
    DB.byIndex(DB.STORES.routine, "sectorId", sectorId),
    DB.byIndex(DB.STORES.focusLogs, "sectorId", sectorId),
    DB.byIndex(DB.STORES.folders, "sectorId", sectorId),
    DB.byIndex(DB.STORES.stickyNotes, "sectorId", sectorId),
  ]);
  for (const r of resources) await DB.delete(DB.STORES.resources, r.id);
  for (const j of jobs) await DB.delete(DB.STORES.jobs, j.id);
  for (const it of routine) await DB.delete(DB.STORES.routine, it.id);
  for (const l of logs) await DB.delete(DB.STORES.focusLogs, l.id);
  for (const f of folders) await DB.delete(DB.STORES.folders, f.id);
  for (const n of notes) await DB.delete(DB.STORES.stickyNotes, n.id);
  const diaryEntries = await DB.byIndex(DB.STORES.studyLog, "sectorId", sectorId);
  for (const d of diaryEntries) await DB.delete(DB.STORES.studyLog, d.id);
  await DB.delete(DB.STORES.sectors, sectorId);
}

/* ===================== Navigation ===================== */
function navigateDashboard() {
  state.currentView = { type: "dashboard" };
  renderSidebar();
  renderDashboard();
}
function navigateSector(sectorId, tab = "overview") {
  state.currentView = { type: "sector", sectorId, tab };
  state.folderStack = [];
  renderSidebar();
  renderSectorView();
}
function navigateSettings() {
  state.currentView = { type: "settings" };
  renderSidebar();
  renderSettingsView();
}
function navigateStickyNotes() {
  state.currentView = { type: "stickyNotes" };
  renderSidebar();
  renderStickyNotesView();
}
function navigateDiary() {
  state.currentView = { type: "diary" };
  renderSidebar();
  renderDiaryView();
}
function navigateDictionary() {
  state.currentView = { type: "dictionary" };
  renderSidebar();
  renderDictionaryView();
}

/* ===================== মোবাইল বটম নেভিগেশন বার ===================== */
function setupMobileBottomNav() {
  qsa("#mobileBottomNav .mbn-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.mbn;
      if (which === "dashboard") navigateDashboard();
      else if (which === "diary") navigateDiary();
      else if (which === "stickyNotes") navigateStickyNotes();
      else if (which === "sectors") openMobileSectorsSheet();
      else if (which === "more") openMobileMoreSheet();
    });
  });
}

function openMobileSectorsSheet() {
  openModal(`
    <h3 class="modal-title">${t("mbn_sectorsSheetTitle")}</h3>
    <div class="sheet-list">
      ${state.sectors.map((s) => `
        <button class="sheet-list-item" data-sheet-sector="${s.id}">
          <span class="sector-dot" style="background:${sectorColor(s)}"></span>
          <span>${escapeHtml(s.name)}</span>
        </button>
      `).join("") || `<div class="empty-state">${t("dash_noSectors")}</div>`}
      <button class="sheet-list-item sheet-list-add" id="sheetAddSector">+ ${t("nav_addSector").replace("+ ", "")}</button>
    </div>
  `);
  qsa("[data-sheet-sector]").forEach((btn) => {
    btn.addEventListener("click", () => { closeModal(); navigateSector(btn.dataset.sheetSector); });
  });
  qs("#sheetAddSector").addEventListener("click", () => { closeModal(); openSectorFormModal(); });
}

function openMobileMoreSheet() {
  openModal(`
    <h3 class="modal-title">${t("mbn_moreSheetTitle")}</h3>
    <div class="sheet-list">
      <button class="sheet-list-item" id="sheetGoDictionary">🔤 ${t("nav_dictionary")}</button>
      <button class="sheet-list-item" id="sheetGoSettings">⚙ ${t("nav_settings")}</button>
    </div>
  `);
  qs("#sheetGoDictionary").addEventListener("click", () => { closeModal(); navigateDictionary(); });
  qs("#sheetGoSettings").addEventListener("click", () => { closeModal(); navigateSettings(); });
}

function syncMobileBottomNavActive() {
  const nav = qs("#mobileBottomNav");
  if (!nav) return;
  const type = state.currentView.type;
  const activeKey = type === "sector" ? "sectors" : type;
  qsa(".mbn-item", nav).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mbn === activeKey);
  });
}

/* ===================== Dashboard ===================== */
async function renderDashboard() {
  const main = qs("#mainView");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${t("dash_title")}</h1>
        <p class="page-subtitle">${t("dash_subtitle")}</p>
      </div>
      <button class="btn btn-accent" id="dashAddSector">${t("nav_addSector")}</button>
    </div>

    <div id="namajCard" class="card namaj-card" style="margin-bottom:26px;"></div>

    <div id="dashSectorGrid" class="grid-cards" style="margin-bottom:26px;"></div>

    <div class="grid-cards dashboard-two-col">
      <div>
        <h2 class="section-title">${t("dash_timeline")}</h2>
        <div id="dashTimeline" class="card"></div>
        <h2 class="section-title">${t("dash_todayDiary")}</h2>
        <div id="dashDiaryQuick" class="card"></div>
      </div>
      <div>
        <h2 class="section-title">${t("dash_calendar")}</h2>
        <div id="dashCalendar" class="card"></div>
      </div>
    </div>
  `;
  qs("#dashAddSector").addEventListener("click", () => openSectorFormModal());

  const grid = qs("#dashSectorGrid");
  if (state.sectors.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      ${t("dash_noSectors")}<br/>${t("dash_noSectorsHint")}
      <div><button class="btn btn-accent" id="dashEmptyAdd">${t("dash_firstSector")}</button></div>
    </div>`;
    qs("#dashEmptyAdd").addEventListener("click", () => openSectorFormModal());
  } else {
    for (const sector of state.sectors) {
      const [jobs, routine] = await Promise.all([
        DB.byIndex(DB.STORES.jobs, "sectorId", sector.id),
        DB.byIndex(DB.STORES.routine, "sectorId", sector.id),
      ]);
      const upcoming = jobs.filter((j) => j.examDate && daysUntil(j.examDate) >= 0).sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
      const doneCount = routine.filter((r) => r.done).length;
      const card = document.createElement("div");
      card.className = "sector-card card";
      const dleft = upcoming ? daysUntil(upcoming.examDate) : null;
      card.innerHTML = `
        <div class="sector-card-top">
          <div class="sector-icon" style="background:${sectorColor(sector)}22;color:${sectorColor(sector)};border:1px solid ${sectorColor(sector)}55;">${escapeHtml(sector.name).slice(0,1)}</div>
          <div class="sector-card-title">${escapeHtml(sector.name)}</div>
        </div>
        <div class="sector-card-stats">
          <span><b>${toNum(jobs.length)}</b> ${t("dash_applications")}</span>
          <span><b>${toNum(doneCount)}/${toNum(routine.length)}</b> ${t("dash_routineDone")}</span>
        </div>
        <div class="sector-card-next ${dleft !== null && dleft <= 3 ? "urgent" : ""}">
          ${upcoming ? `${t("dash_nextExam")}: ${fmtDate(upcoming.examDate)} (${dleft === 0 ? t("dash_today") : toNum(dleft) + " " + t("dash_daysLeft")})` : t("dash_noUpcoming")}
        </div>
      `;
      card.addEventListener("click", () => navigateSector(sector.id));
      grid.appendChild(card);
    }
  }

  await renderDashboardTimeline();
  await renderDashboardCalendar();
  await renderDashboardDiaryQuick();
  await renderNamajCard();
}

async function collectAllEvents() {
  const events = []; // {kind, date, title, meta, sector}
  for (const sector of state.sectors) {
    const [jobs, routine] = await Promise.all([
      DB.byIndex(DB.STORES.jobs, "sectorId", sector.id),
      DB.byIndex(DB.STORES.routine, "sectorId", sector.id),
    ]);
    jobs.forEach((j) => {
      if (j.examDate) events.push({ kind: "exam", date: j.examDate, title: `${j.jobTitle} — ${isBn() ? "পরীক্ষা" : "Exam"}`, meta: j.examAuthority ? `${isBn()?"আয়োজক":"By"}: ${j.examAuthority}` : "", sector });
      if (j.applyDeadline) events.push({ kind: "deadline", date: j.applyDeadline, title: `${j.jobTitle} — ${isBn() ? "আবেদনের শেষ তারিখ" : "Apply deadline"}`, meta: "", sector });
    });
    routine.forEach((r) => {
      events.push({ kind: "routine", date: r.date, title: r.topic, meta: "", sector });
    });
  }
  return events;
}

async function renderDashboardTimeline() {
  const box = qs("#dashTimeline");
  const events = (await collectAllEvents()).filter((e) => e.kind !== "routine");
  events.sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((i) => daysUntil(i.date) >= 0);
  const relevant = upcoming.length ? upcoming : events.slice(-5);

  if (relevant.length === 0) {
    box.innerHTML = `<div class="empty-state">${t("dash_noSchedule")}</div>`;
    return;
  }

  box.innerHTML = `<div class="timeline-list">${relevant.slice(0, 12).map((it) => {
    const d = daysUntil(it.date);
    const cls = d <= 2 ? "urgent" : d <= 7 ? "soon" : "";
    const dt = new Date(it.date + "T00:00:00");
    const months = isBn() ? BN_MONTHS : EN_MONTHS;
    return `<div class="timeline-item">
      <div class="timeline-daybox ${cls}"><div class="n">${toNum(dt.getDate())}</div><div class="u">${months[dt.getMonth()].slice(0,3)}</div></div>
      <div class="timeline-mid">
        <div class="timeline-title">${escapeHtml(it.title)}</div>
        <div class="timeline-meta">${d === 0 ? t("dash_today") : d < 0 ? toNum(Math.abs(d)) + " " + t("rt_dayBefore") : toNum(d) + " " + t("dash_daysLeft")}${it.meta ? " · " + escapeHtml(it.meta) : ""}</div>
      </div>
      <span class="timeline-sector-tag" style="border-color:${sectorColor(it.sector)}66;color:${sectorColor(it.sector)}">${escapeHtml(it.sector.name)}</span>
    </div>`;
  }).join("")}</div>`;
}

async function renderDashboardCalendar() {
  const box = qs("#dashCalendar");
  const events = await collectAllEvents();
  const eventsByDate = {};
  events.forEach((e) => { (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e); });
  const todayStr = new Date().toISOString().slice(0, 10);

  renderMonthCalendar({
    container: box,
    year: state.calYear,
    month: state.calMonth,
    eventsByDate,
    todayStr,
    onDayClick: (dateStr, evts) => {
      const detail = qs("#calDayDetail", box);
      if (!evts.length) { detail.innerHTML = `<div class="muted">${t("cal_dayDetail_empty")}</div>`; return; }
      detail.innerHTML = evts.map((e) => `
        <div class="cal-day-detail-item">
          <span>${escapeHtml(e.title)} <span class="muted" style="font-size:11px;">(${escapeHtml(e.sector.name)})</span></span>
          <span class="cal-tag ${e.kind}">${e.kind === "exam" ? t("cal_examTag") : e.kind === "deadline" ? t("cal_deadlineTag") : t("cal_routineTag")}</span>
        </div>
      `).join("");
    },
  });

  qs("#calPrevBtn", box).addEventListener("click", () => {
    state.calMonth--; if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderDashboardCalendar();
  });
  qs("#calNextBtn", box).addEventListener("click", () => {
    state.calMonth++; if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderDashboardCalendar();
  });
}

async function renderDashboardDiaryQuick() {
  const box = qs("#dashDiaryQuick");
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const all = await DB.all(DB.STORES.studyLog);
  const todayEntries = all.filter((e) => e.date === today);
  const tomorrowEntries = all.filter((e) => e.date === tomorrow);

  box.innerHTML = `
    <div class="diary-col-grid" style="margin-bottom:0;">
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px;">${t("diary_todayLabel")}</div>
        <div id="dashDiaryToday">${renderDiaryEntryGroup(todayEntries)}</div>
        <button class="btn btn-sm" style="margin-top:8px;" id="quickAddToday">${t("diary_addToday")}</button>
      </div>
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px;">${t("diary_tomorrowLabel")}</div>
        <div id="dashDiaryTomorrow">${renderDiaryEntryGroup(tomorrowEntries)}</div>
        <button class="btn btn-sm" style="margin-top:8px;" id="quickAddTomorrow">${t("diary_addTomorrow")}</button>
      </div>
    </div>
  `;
  qs("#quickAddToday").addEventListener("click", () => openDiaryEntryModal(today));
  qs("#quickAddTomorrow").addEventListener("click", () => openDiaryEntryModal(tomorrow));
  wireDiaryEntryCheckboxes(box);
}

/* একগুচ্ছ ডায়েরি এন্ট্রি "চলমান" ও "সম্পন্ন" — এই দুই ভাগে দেখায়।
   সম্পন্ন এন্ট্রিগুলো স্ট্রাইকথ্রু হয়ে নিচে চলে যায়, যাতে বোঝা যায় কতটুকু পড়া শেষ হলো। */
function renderDiaryEntryGroup(entries) {
  if (!entries.length) return `<div class="muted" style="font-size:12.5px;">${t("diary_empty")}</div>`;
  const pending = entries.filter((e) => !e.done);
  const completed = entries.filter((e) => e.done);
  let html = pending.map((e) => diaryEntryHtml(e)).join("");
  if (completed.length) {
    html += `<div class="diary-subhead">${t("diary_completedHead")} (${toNum(completed.length)})</div>`;
    html += completed.map((e) => diaryEntryHtml(e)).join("");
  }
  return html;
}

function diaryEntryHtml(e, { allowDelete = false } = {}) {
  const sector = state.sectors.find((s) => s.id === e.sectorId);
  const tagBits = [sector ? escapeHtml(sector.name) : null, e.subjectName ? escapeHtml(e.subjectName) : null, e.topicName ? escapeHtml(e.topicName) : null].filter(Boolean);
  return `<div class="diary-entry ${e.done ? "completed" : ""}" data-entry-id="${e.id}">
    <div class="diary-entry-meta">
      <span>${tagBits.join(" › ")}</span>
      ${allowDelete ? `<button data-diary-del="${e.id}" style="background:none;border:none;color:var(--text-faint);cursor:pointer;">✕</button>` : ""}
    </div>
    <div class="diary-entry-check">
      <input type="checkbox" data-diary-done="${e.id}" ${e.done ? "checked" : ""} title="${t("diary_markDone")}" />
      <div>
        <div class="diary-entry-text">${escapeHtml(e.text)} ${speakBtn(e.text)}</div>
        ${e.materialTitle ? `<div class="diary-entry-attach">📎 ${escapeHtml(e.materialTitle)}</div>` : ""}
      </div>
    </div>
  </div>`;
}

function wireDiaryEntryCheckboxes(container) {
  qsa("[data-diary-done]", container).forEach((cb) => {
    cb.addEventListener("change", async () => {
      const entry = await DB.get(DB.STORES.studyLog, cb.dataset.diaryDone);
      if (!entry) return;
      entry.done = cb.checked;
      await DB.put(DB.STORES.studyLog, entry);
      if (cb.checked && entry.topicId) {
        await markTopicCompleted(entry.topicId, true);
        toast(t("diary_topicCompletedToast"));
      }
      rerenderCurrentView();
    });
  });
  qsa("[data-diary-del]", container).forEach((btn) => {
    btn.addEventListener("click", async () => {
      await DB.delete(DB.STORES.studyLog, btn.dataset.diaryDel);
      rerenderCurrentView();
    });
  });
}


/* ===================== Namaj (prayer) tracker ===================== */
const NAMAJ_KEYS = ["fajr", "zuhr", "asr", "maghrib", "isha"];
function namajLabel(key) { return t(`namaj_${key}`); }

async function getNamajRecord(date) {
  const rec = await DB.get(DB.STORES.namaj, date);
  return rec || { id: date, date, fajr: false, zuhr: false, asr: false, maghrib: false, isha: false };
}

async function toggleNamajPrayer(date, key, value) {
  const rec = await getNamajRecord(date);
  rec[key] = value;
  rec.updatedAt = Date.now();
  await DB.put(DB.STORES.namaj, rec);
}

function namajCountDone(rec) {
  return NAMAJ_KEYS.reduce((n, k) => n + (rec[k] ? 1 : 0), 0);
}

async function renderNamajCard() {
  const box = qs("#namajCard");
  if (!box) return;
  const today = new Date().toISOString().slice(0, 10);
  const todayRec = await getNamajRecord(today);

  const allRecords = await DB.all(DB.STORES.namaj);
  const byDate = {};
  allRecords.forEach((r) => { byDate[r.date] = r; });

  // গত ১৪ দিনের হিস্ট্রি স্ট্রিপ
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ dateStr, day: d.getDate(), rec: byDate[dateStr] || null });
  }
  const last7Total = days.slice(7).reduce((sum, d) => sum + (d.rec ? namajCountDone(d.rec) : 0), 0);

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
      <div>
        <h3 style="margin:0;font-size:14.5px;">🕌 ${t("namaj_title")}</h3>
        <p class="muted" style="margin:4px 0 0;font-size:12px;">${t("namaj_last7")}: <b>${toNum(last7Total)}/${toNum(35)}</b></p>
      </div>
      <span class="muted" style="font-size:12px;">${fmtDate(today)}</span>
    </div>
    <div class="namaj-today-row">
      ${NAMAJ_KEYS.map((k) => `
        <label class="namaj-pill ${todayRec[k] ? "done" : ""}">
          <input type="checkbox" data-namaj-key="${k}" ${todayRec[k] ? "checked" : ""} />
          <span>${namajLabel(k)}</span>
        </label>
      `).join("")}
    </div>
    <div class="namaj-history-strip">
      ${days.map((d) => {
        const count = d.rec ? namajCountDone(d.rec) : 0;
        const level = count === 0 ? 0 : Math.ceil((count / 5) * 4);
        return `<button class="namaj-day-chip level-${level}" data-namaj-day="${d.dateStr}" title="${fmtDate(d.dateStr)} — ${toNum(count)}/${toNum(5)}">${toNum(d.day)}</button>`;
      }).join("")}
    </div>
  `;

  qsa("[data-namaj-key]", box).forEach((cb) => {
    cb.addEventListener("change", async (e) => {
      await toggleNamajPrayer(today, cb.dataset.namajKey, cb.checked);
      renderNamajCard();
    });
  });
  qsa("[data-namaj-day]", box).forEach((chip) => {
    chip.addEventListener("click", () => openNamajDayEditor(chip.dataset.namajDay));
  });
}

async function openNamajDayEditor(date) {
  const rec = await getNamajRecord(date);
  openModal(`
    <h3 class="modal-title">🕌 ${fmtDate(date)}</h3>
    <div class="namaj-editor-grid">
      ${NAMAJ_KEYS.map((k) => `
        <label class="namaj-pill ${rec[k] ? "done" : ""}" style="justify-content:center;">
          <input type="checkbox" data-namaj-edit-key="${k}" ${rec[k] ? "checked" : ""} />
          <span>${namajLabel(k)}</span>
        </label>
      `).join("")}
    </div>
    <div class="form-actions">
      <button class="btn btn-accent" id="namajEditorClose">${t("common_close")}</button>
    </div>
  `);
  qsa("[data-namaj-edit-key]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      await toggleNamajPrayer(date, cb.dataset.namajEditKey, cb.checked);
      cb.closest(".namaj-pill").classList.toggle("done", cb.checked);
    });
  });
  qs("#namajEditorClose").addEventListener("click", () => { closeModal(); renderNamajCard(); });
}

/* ===================== Sector view ===================== */
const SECTOR_TABS = [
  { key: "overview", labelKey: "tab_overview" },
  { key: "resources", labelKey: "tab_resources" },
  { key: "pictures", labelKey: "tab_pictures" },
  { key: "courses", labelKey: "tab_courses" },
  { key: "routine", labelKey: "tab_routine" },
  { key: "jobs", labelKey: "tab_jobs" },
  { key: "focus", labelKey: "tab_focus" },
];

async function renderSectorView() {
  const sector = state.sectors.find((s) => s.id === state.currentView.sectorId);
  const main = qs("#mainView");
  if (!sector) { navigateDashboard(); return; }

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(sector.name)}</h1>
        <p class="page-subtitle">${escapeHtml(sector.description || t("sector_defaultDesc"))}</p>
      </div>
      <button class="btn" id="btnEditSector">${t("sector_editBtn")}</button>
    </div>
    <div class="tabs" id="sectorTabs">
      ${SECTOR_TABS.map((tb) => `<button class="tab-btn ${state.currentView.tab === tb.key ? "active" : ""}" data-tab="${tb.key}">${t(tb.labelKey)}</button>`).join("")}
    </div>
    <div id="sectorTabContent"></div>
  `;
  qs("#btnEditSector").addEventListener("click", () => openSectorFormModal(sector));
  qsa("#sectorTabs .tab-btn").forEach((b) => {
    b.addEventListener("click", () => {
      state.currentView.tab = b.dataset.tab;
      state.folderStack = [];
      renderSectorView();
    });
  });

  const content = qs("#sectorTabContent");
  switch (state.currentView.tab) {
    case "overview": return renderSectorOverview(sector, content);
    case "resources": return renderSectorResources(sector, content);
    case "pictures": return renderSectorPictures(sector, content);
    case "courses": return renderSectorCourses(sector, content);
    case "routine": return renderSectorRoutine(sector, content);
    case "jobs": return renderSectorJobs(sector, content);
    case "focus": return renderSectorFocusHistory(sector, content);
  }
}

async function renderSectorOverview(sector, content) {
  const [resources, jobs, routine, logs] = await Promise.all([
    DB.byIndex(DB.STORES.resources, "sectorId", sector.id),
    DB.byIndex(DB.STORES.jobs, "sectorId", sector.id),
    DB.byIndex(DB.STORES.routine, "sectorId", sector.id),
    DB.byIndex(DB.STORES.focusLogs, "sectorId", sector.id),
  ]);
  const books = resources.filter((r) => r.type !== "picture").length;
  const pictures = resources.filter((r) => r.type === "picture").length;
  const done = routine.filter((r) => r.done).length;
  const pct = routine.length ? Math.round((done / routine.length) * 100) : 0;
  const totalFocusMin = logs.reduce((s, l) => s + l.minutes, 0);
  const upcomingJobs = jobs.filter((j) => j.examDate && daysUntil(j.examDate) >= 0).sort((a, b) => a.examDate.localeCompare(b.examDate));

  content.innerHTML = `
    <div class="grid-cards" style="margin-bottom:24px;">
      <div class="card"><div class="muted" style="font-size:12px;">${t("ov_books")}</div><div style="font-size:24px;font-weight:700;">${toNum(books)}</div></div>
      <div class="card"><div class="muted" style="font-size:12px;">${t("ov_pictures")}</div><div style="font-size:24px;font-weight:700;">${toNum(pictures)}</div></div>
      <div class="card"><div class="muted" style="font-size:12px;">${t("ov_applications")}</div><div style="font-size:24px;font-weight:700;">${toNum(jobs.length)}</div></div>
      <div class="card"><div class="muted" style="font-size:12px;">${t("ov_focusTime")}</div><div style="font-size:24px;font-weight:700;">${toNum(totalFocusMin)} ${t("ov_minutes")}</div></div>
    </div>

    <h2 class="section-title">${t("ov_routineProgress")}</h2>
    <div class="card" style="margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;">
        <span class="muted">${toNum(done)} / ${toNum(routine.length)} ${t("ov_completed")}</span>
        <span>${toNum(pct)}%</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;background:${sectorColor(sector)}"></div></div>
    </div>

    <h2 class="section-title">${t("ov_upcomingExam")}</h2>
    <div class="card" style="margin-bottom:24px;">
      ${upcomingJobs.length === 0 ? `<span class="muted">${t("ov_noUpcoming")}</span>` : upcomingJobs.slice(0,5).map((j) => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <span>${escapeHtml(j.jobTitle)}</span>
          <span class="muted">${fmtDate(j.examDate)} · ${toNum(daysUntil(j.examDate))} ${t("dash_daysLeft")}</span>
        </div>
      `).join("")}
    </div>

    <h2 class="section-title">${t("syllabus_title")}</h2>
    <div class="card" id="syllabusBox"></div>
  `;

  await renderSyllabusProgress(sector, qs("#syllabusBox"));
}

/* সাবজেক্ট/টপিক (কোর্স ট্যাবের ফোল্ডার) থেকে সিলেবাস অগ্রগতি হিসাব করে দেখায়।
   টপিকের পাশের চেকবক্স থেকে সরাসরি সম্পন্ন/অসম্পন্ন টগল করা যায়। */
async function renderSyllabusProgress(sector, box) {
  const subjects = await getSubjects(sector.id);
  if (subjects.length === 0) {
    box.innerHTML = `<div class="syllabus-empty">${t("syllabus_empty")}</div>`;
    return;
  }
  const subjectBlocks = [];
  let totalTopics = 0, totalDone = 0;
  for (const subj of subjects) {
    const topics = await getTopics(subj.id);
    const doneCount = topics.filter((tp) => tp.completed).length;
    totalTopics += topics.length;
    totalDone += doneCount;
    const pct = topics.length ? Math.round((doneCount / topics.length) * 100) : 0;
    subjectBlocks.push(`
      <div class="syllabus-subject">
        <div class="syllabus-subject-head">
          <span>${escapeHtml(subj.name)}</span>
          <span class="syllabus-subject-pct">${toNum(doneCount)}/${toNum(topics.length)} (${toNum(pct)}%)</span>
        </div>
        <div class="progress-bar" style="margin-bottom:6px;"><div class="progress-bar-fill" style="width:${pct}%;background:${sectorColor(sector)}"></div></div>
        ${topics.length === 0 ? `<div class="muted" style="font-size:12px;">—</div>` : topics.map((tp) => `
          <div class="syllabus-topic-row ${tp.completed ? "completed" : ""}">
            <input type="checkbox" data-topic-toggle="${tp.id}" ${tp.completed ? "checked" : ""} />
            <span>${escapeHtml(tp.name)}</span>
          </div>
        `).join("")}
      </div>
    `);
  }
  const overallPct = totalTopics ? Math.round((totalDone / totalTopics) * 100) : 0;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
      <span class="muted">${t("syllabus_overall")}</span>
      <span><b>${toNum(totalDone)}/${toNum(totalTopics)}</b> (${toNum(overallPct)}%)</span>
    </div>
    <div class="progress-bar" style="margin-bottom:18px;"><div class="progress-bar-fill" style="width:${overallPct}%;background:${sectorColor(sector)}"></div></div>
    ${subjectBlocks.join("")}
  `;

  qsa("[data-topic-toggle]", box).forEach((cb) => {
    cb.addEventListener("change", async () => {
      await markTopicCompleted(cb.dataset.topicToggle, cb.checked);
      renderSyllabusProgress(sector, box);
    });
  });
}

/* ===================== Resources (books/pdfs) ===================== */
async function renderSectorResources(sector, content) {
  const resources = (await DB.byIndex(DB.STORES.resources, "sectorId", sector.id)).filter((r) => r.type !== "picture" && !r.folderId);

  content.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;">
      <button class="btn" id="btnGenRoutine">${t("res_genRoutine")}</button>
      <button class="btn btn-accent" id="btnUploadResource">${t("res_addBook")}</button>
    </div>
    <div class="resource-list" id="resourceList"></div>
  `;

  const listEl = qs("#resourceList");
  if (resources.length === 0) {
    listEl.innerHTML = `<div class="empty-state">${t("res_empty")}</div>`;
  } else {
    resources.sort((a,b) => b.addedAt - a.addedAt).forEach((r) => listEl.appendChild(resourceRow(r)));
  }

  qs("#btnUploadResource").addEventListener("click", () => openResourceUploadModal(sector.id, "book", null));
  qs("#btnGenRoutine").addEventListener("click", async () => {
    const allRes = await DB.byIndex(DB.STORES.resources, "sectorId", sector.id);
    openPdfRoutineModal(sector, allRes.filter((r) => r.mime === "application/pdf"));
  });
}

function resourceRow(r) {
  const row = document.createElement("div");
  row.className = "resource-row";
  const icon = r.mime === "application/pdf" ? "📄" : "📘";
  row.innerHTML = `
    <div class="resource-icon">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div class="resource-name">${escapeHtml(r.title)}</div>
      <div class="resource-meta">${r.mime === "application/pdf" ? t("res_pdf") : t("res_book")} · ${new Date(r.addedAt).toLocaleDateString()}</div>
    </div>
    <div class="resource-actions">
      <button class="btn btn-sm" data-act="open">${t("common_open")}</button>
      <button class="btn btn-sm btn-danger" data-act="del">${t("common_delete")}</button>
    </div>
  `;
  qs('[data-act="open"]', row).addEventListener("click", () => {
    const url = URL.createObjectURL(r.blob);
    window.open(url, "_blank");
  });
  qs('[data-act="del"]', row).addEventListener("click", async () => {
    if (!confirm(`"${r.title}" ${t("res_deleteConfirm")}`)) return;
    await DB.delete(DB.STORES.resources, r.id);
    rerenderCurrentView();
  });
  return row;
}

function openResourceUploadModal(sectorId, type, folderId) {
  openModal(`
    <h3 class="modal-title">${type === "picture" ? t("res_uploadTitlePic") : t("res_uploadTitleFile")}</h3>
    <div class="form-row">
      <label>${t("res_chooseFile")}</label>
      <input type="file" id="resourceFileInput" ${type === "picture" ? 'accept="image/*"' : "accept=\".pdf,.epub,application/pdf\""} />
    </div>
    <div class="form-row">
      <label>${t("common_title")}</label>
      <input type="text" id="resourceTitleInput" placeholder="${t("res_titlePh")}" />
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="btnCancelRes">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="btnSaveRes">${t("common_save")}</button>
    </div>
  `);
  const fileInput = qs("#resourceFileInput");
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0] && !qs("#resourceTitleInput").value) {
      qs("#resourceTitleInput").value = fileInput.files[0].name.replace(/\.[^.]+$/, "");
    }
  });
  qs("#btnCancelRes").addEventListener("click", closeModal);
  qs("#btnSaveRes").addEventListener("click", async () => {
    const file = fileInput.files[0];
    const title = qs("#resourceTitleInput").value.trim();
    if (!file) { toast(t("res_chooseFileFirst")); return; }
    if (!title) { toast(t("res_titleRequired")); return; }
    await DB.put(DB.STORES.resources, {
      id: uid(), sectorId, type, title, blob: file, mime: file.type, size: file.size,
      addedAt: Date.now(), folderId: folderId || null,
    });
    closeModal();
    rerenderCurrentView();
    toast(t("res_added"));
  });
}

/* ===================== Pictures ===================== */
async function renderSectorPictures(sector, content) {
  const pictures = (await DB.byIndex(DB.STORES.resources, "sectorId", sector.id)).filter((x) => x.type === "picture");
  content.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <button class="btn btn-accent" id="btnUploadPic">${t("pic_addBtn")}</button>
    </div>
    <div class="image-grid" id="picGrid"></div>
  `;
  const grid = qs("#picGrid");
  if (pictures.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${t("pic_empty")}</div>`;
  } else {
    pictures.sort((a,b) => b.addedAt - a.addedAt).forEach((p) => {
      const url = URL.createObjectURL(p.blob);
      const tile = document.createElement("div");
      tile.className = "image-tile";
      tile.innerHTML = `<img src="${url}" alt="${escapeHtml(p.title)}" /><div class="image-tile-cap"><span title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span><button class="btn btn-sm btn-danger" style="padding:2px 7px;">✕</button></div>`;
      qs("button", tile).addEventListener("click", async () => {
        if (!confirm(t("pic_deleteConfirm"))) return;
        await DB.delete(DB.STORES.resources, p.id);
        rerenderCurrentView();
      });
      tile.querySelector("img").addEventListener("click", () => window.open(url, "_blank"));
      grid.appendChild(tile);
    });
  }
  qs("#btnUploadPic").addEventListener("click", () => openResourceUploadModal(sector.id, "picture", null));
}

/* ===================== Courses & folders ===================== */
async function renderSectorCourses(sector, content) {
  const currentFolderId = state.folderStack.length ? state.folderStack[state.folderStack.length - 1].id : null;

  const [allFolders, allResources] = await Promise.all([
    DB.byIndex(DB.STORES.folders, "sectorId", sector.id),
    DB.byIndex(DB.STORES.resources, "sectorId", sector.id),
  ]);
  const subFolders = allFolders.filter((f) => (f.parentId || null) === currentFolderId);
  const materials = allResources.filter((r) => (r.folderId || null) === currentFolderId && r.type !== "picture");

  const breadcrumb = `
    <div class="breadcrumb">
      <span class="bc-link" id="bcRoot">${t("courses_root")}</span>
      ${state.folderStack.map((f, idx) => `<span class="bc-sep">›</span><span class="bc-link" data-idx="${idx}">${escapeHtml(f.name)}</span>`).join("")}
    </div>
  `;

  content.innerHTML = `
    ${breadcrumb}
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;">
      <button class="btn" id="btnAddMaterial">${t("courses_addMaterial")}</button>
      <button class="btn btn-accent" id="btnAddFolder">${t("courses_add")}</button>
    </div>
    ${(subFolders.length === 0 && materials.length === 0) ? `<div class="empty-state">${t("courses_empty")}</div>` : ""}
    <div class="folder-grid" id="folderGrid"></div>
    <div class="resource-list" id="materialList"></div>
  `;

  qs("#bcRoot").addEventListener("click", () => { state.folderStack = []; renderSectorView(); });
  qsa(".breadcrumb .bc-link[data-idx]").forEach((el) => {
    el.addEventListener("click", () => {
      state.folderStack = state.folderStack.slice(0, Number(el.dataset.idx) + 1);
      renderSectorView();
    });
  });

  const fgrid = qs("#folderGrid");
  subFolders.forEach((f) => {
    const childCount = allFolders.filter((x) => x.parentId === f.id).length + allResources.filter((r) => r.folderId === f.id).length;
    const tile = document.createElement("div");
    tile.className = "folder-tile";
    tile.innerHTML = `
      <button class="folder-tile-del" data-id="${f.id}">✕</button>
      <div class="folder-tile-icon">📁</div>
      <div class="folder-tile-name">${escapeHtml(f.name)}</div>
      <div class="folder-tile-meta">${toNum(childCount)} ${t("courses_itemsCount")}</div>
    `;
    tile.addEventListener("click", () => { state.folderStack.push({ id: f.id, name: f.name }); renderSectorView(); });
    qs(".folder-tile-del", tile).addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(t("courses_folderDeleteConfirm"))) return;
      await deleteFolderCascade(f.id);
      rerenderCurrentView();
    });
    fgrid.appendChild(tile);
  });

  const mlist = qs("#materialList");
  materials.sort((a,b) => b.addedAt - a.addedAt).forEach((r) => mlist.appendChild(resourceRow(r)));

  qs("#btnAddFolder").addEventListener("click", () => openFolderFormModal(sector.id, currentFolderId));
  qs("#btnAddMaterial").addEventListener("click", () => openResourceUploadModal(sector.id, "book", currentFolderId));
}

async function deleteFolderCascade(folderId) {
  const children = await DB.byIndex(DB.STORES.folders, "parentId", folderId);
  for (const c of children) await deleteFolderCascade(c.id);
  const allRes = await DB.all(DB.STORES.resources);
  for (const r of allRes.filter((x) => x.folderId === folderId)) await DB.delete(DB.STORES.resources, r.id);
  await DB.delete(DB.STORES.folders, folderId);
}

function openFolderFormModal(sectorId, parentId) {
  openModal(`
    <h3 class="modal-title">${t("courses_newFolderTitle")}</h3>
    <div class="form-row">
      <label>${t("courses_folderName")}</label>
      <input type="text" id="folderNameInput" placeholder="${t("courses_folderNamePh")}" />
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="folderCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="folderSave">${t("common_save")}</button>
    </div>
  `);
  qs("#folderCancel").addEventListener("click", closeModal);
  qs("#folderSave").addEventListener("click", async () => {
    const name = qs("#folderNameInput").value.trim();
    if (!name) { toast(t("courses_nameRequired")); return; }
    await DB.put(DB.STORES.folders, { id: uid(), sectorId, parentId: parentId || null, name, createdAt: Date.now() });
    closeModal();
    rerenderCurrentView();
    toast(t("res_added"));
  });
}

/* ===================== Routine ===================== */
async function renderSectorRoutine(sector, content) {
  const items = await DB.byIndex(DB.STORES.routine, "sectorId", sector.id);
  const folders = await DB.byIndex(DB.STORES.folders, "sectorId", sector.id);
  const folderName = (id) => { const f = folders.find((x) => x.id === id); return f ? f.name : null; };

  content.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;">
      <button class="btn" id="btnGenRoutine2">${t("rt_genRoutine")}</button>
      <button class="btn btn-accent" id="btnAddRoutineItem">${t("rt_addManual")}</button>
    </div>
    <div id="routineGroups"></div>
  `;
  qs("#btnAddRoutineItem").addEventListener("click", () => openAddRoutineItemModal(sector.id));
  qs("#btnGenRoutine2").addEventListener("click", async () => {
    const pdfs = (await DB.byIndex(DB.STORES.resources, "sectorId", sector.id)).filter((r) => r.mime === "application/pdf");
    openPdfRoutineModal(sector, pdfs);
  });

  const groupsEl = qs("#routineGroups");
  if (items.length === 0) {
    groupsEl.innerHTML = `<div class="empty-state">${t("rt_empty")}</div>`;
    return;
  }

  const byDate = {};
  items.forEach((it) => { (byDate[it.date] = byDate[it.date] || []).push(it); });
  const dates = Object.keys(byDate).sort();

  groupsEl.innerHTML = dates.map((date) => {
    const d = daysUntil(date);
    const dayItems = byDate[date].sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
    const doneN = dayItems.filter((i) => i.done).length;
    return `<div class="routine-day-group">
      <div class="routine-day-heading">
        <strong>${fmtDate(date)}</strong>
        <span class="muted">${d === 0 ? `(${t("rt_today")})` : d > 0 ? `(${toNum(d)} ${t("rt_dayAfter")})` : `(${toNum(Math.abs(d))} ${t("rt_dayBefore")})`}</span>
        <span class="count">— ${toNum(doneN)}/${toNum(dayItems.length)}</span>
      </div>
      ${dayItems.map((it) => {
        const tagBits = [folderName(it.subjectId), folderName(it.topicId)].filter(Boolean);
        return `
        <div class="routine-item ${it.done ? "done" : ""}" data-id="${it.id}">
          <input type="checkbox" ${it.done ? "checked" : ""} data-id="${it.id}" />
          <div class="routine-item-text">${escapeHtml(it.topic)} ${speakBtn(it.topic)}${tagBits.length ? `<span class="item-tag">${escapeHtml(tagBits.join(" › "))}</span>` : ""}${it.source ? `<div class="routine-item-source">${t("rt_source")}: ${escapeHtml(it.source)}</div>` : ""}</div>
          <button class="routine-item-del" data-id="${it.id}">✕</button>
        </div>
      `;
      }).join("")}
    </div>`;
  }).join("");

  qsa('input[type=checkbox]', groupsEl).forEach((cb) => {
    cb.addEventListener("change", async () => {
      const item = items.find((i) => i.id === cb.dataset.id);
      item.done = cb.checked;
      await DB.put(DB.STORES.routine, item);
      if (cb.checked && item.topicId) {
        await markTopicCompleted(item.topicId, true);
        toast(t("diary_topicCompletedToast"));
      }
      rerenderCurrentView();
    });
  });
  qsa(".routine-item-del", groupsEl).forEach((btn) => {
    btn.addEventListener("click", async () => {
      await DB.delete(DB.STORES.routine, btn.dataset.id);
      rerenderCurrentView();
    });
  });
}

function openAddRoutineItemModal(sectorId) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <h3 class="modal-title">${t("rt_addTitle")}</h3>
    <div class="form-row"><label>${t("common_date")}</label><input type="date" id="riDate" value="${today}" /></div>
    <div class="form-row"><label>${t("rt_topicLabel")}</label><textarea id="riTopic" rows="2" placeholder="${t("rt_topicPh")}"></textarea></div>
    ${cascadeSelectHTML("riCasc", { sectorFixed: true, sectorId })}
    <div class="form-actions">
      <button class="btn btn-ghost" id="riCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="riSave">${t("common_add")}</button>
    </div>
  `);
  wireCascadeSelect("riCasc", {});
  qs("#riCancel").addEventListener("click", closeModal);
  qs("#riSave").addEventListener("click", async () => {
    const date = qs("#riDate").value;
    const topic = qs("#riTopic").value.trim();
    if (!date || !topic) { toast(t("rt_bothRequired")); return; }
    const { subjectId, topicId } = cascadeValues("riCasc");
    await DB.put(DB.STORES.routine, { id: uid(), sectorId, date, topic, subjectId, topicId, done: false, createdAt: Date.now() });
    closeModal();
    rerenderCurrentView();
    toast(t("rt_added"));
  });
}

/* ---- PDF → auto routine ---- */
async function openPdfRoutineModal(sector, existingPdfs) {
  const jobs = await DB.byIndex(DB.STORES.jobs, "sectorId", sector.id);
  const today = new Date().toISOString().slice(0, 10);

  openModal(`
    <h3 class="modal-title">${t("pr_title")}</h3>
    <div class="form-row">
      <label>${t("pr_choosePdf")}</label>
      <select id="prPdfSelect">
        <option value="__new__">${t("pr_newUpload")}</option>
        ${existingPdfs.map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("")}
      </select>
    </div>
    <div class="form-row" id="prNewFileRow">
      <label>${t("pr_pdfFile")}</label>
      <input type="file" id="prFileInput" accept=".pdf,application/pdf" />
    </div>
    <div class="form-row form-grid2">
      <div><label>${t("pr_startDate")}</label><input type="date" id="prStart" value="${today}" /></div>
      <div>
        <label>${t("pr_endDate")}</label>
        <select id="prExamLink"><option value="">${t("pr_pickManually")}</option>${jobs.filter(j=>j.examDate).map((j) => `<option value="${j.examDate}">${escapeHtml(j.jobTitle)} (${fmtDate(j.examDate)})</option>`).join("")}</select>
        <input type="date" id="prEnd" style="margin-top:6px;" />
      </div>
    </div>
    <div class="form-row"><label>${t("pr_perDay")}</label><input type="number" id="prPerDay" min="1" max="20" value="3" /></div>
    <div class="form-row">
      <label>${t("cascade_subject")} / ${t("cascade_topic")} (${isBn() ? "ঐচ্ছিক, পুরো ব্যাচ ট্যাগ হবে" : "optional, tags the whole batch"})</label>
      ${cascadeSelectHTML("prCasc", { sectorFixed: true, sectorId: sector.id })}
    </div>
    <div class="field-hint" id="prStatus">${t("pr_hintInitial")}</div>
    <div id="prTopicsWrap" style="margin-top:10px;display:none;">
      <label class="muted" style="font-size:12.5px;">${t("pr_foundTopicsLabel")} (<span id="prTopicCount"></span>) —</label>
      <div class="pdf-topic-list" id="prTopicList"></div>
      <div class="form-row" style="margin-top:8px;">
        <input type="text" id="prAddTopicInput" placeholder="${isBn() ? "নিজে একটা টপিক লাইন যোগ করুন…" : "Add a topic line manually…"}" />
      </div>
      <button class="btn btn-sm" id="prAddTopicBtn">+ ${t("common_add")}</button>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="prCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="prGenerate" disabled>${t("pr_generateBtn")}</button>
    </div>
  `, { wide: true });

  wireCascadeSelect("prCasc", {});

  let currentTopics = [];
  let sourceTitle = "";

  qs("#prExamLink").addEventListener("change", (e) => { if (e.target.value) qs("#prEnd").value = e.target.value; });
  qs("#prCancel").addEventListener("click", closeModal);

  async function processFile(arrayBuffer, title) {
    sourceTitle = title;
    qs("#prStatus").textContent = t("pr_reading");
    try {
      const lines = await RoutineGen.extractLines(arrayBuffer, (p, total) => {
        qs("#prStatus").textContent = `${t("pr_readingPage")} ${p}/${total})`;
      });
      currentTopics = RoutineGen.extractTopics(lines);
      qs("#prStatus").textContent = `"${title}" ${t("pr_from")} ${currentTopics.length} ${t("pr_topicsFound")}`;
      qs("#prTopicsWrap").style.display = "block";
      qs("#prTopicCount").textContent = currentTopics.length;
      renderTopicList();
      qs("#prGenerate").disabled = currentTopics.length === 0;
    } catch (err) {
      qs("#prStatus").textContent = t("pr_readError");
      console.error(err);
    }
  }

  function renderTopicList() {
    const list = qs("#prTopicList");
    list.innerHTML = currentTopics.map((tp, i) => `<div data-i="${i}" style="display:flex;justify-content:space-between;gap:8px;"><span>${escapeHtml(tp)}</span><button data-del="${i}" style="background:none;border:none;color:var(--text-faint);cursor:pointer;">✕</button></div>`).join("");
    qsa("[data-del]", list).forEach((b) => b.addEventListener("click", () => {
      currentTopics.splice(Number(b.dataset.del), 1);
      qs("#prTopicCount").textContent = currentTopics.length;
      renderTopicList();
      qs("#prGenerate").disabled = currentTopics.length === 0;
    }));
  }

  qs("#prAddTopicBtn").addEventListener("click", () => {
    const val = qs("#prAddTopicInput").value.trim();
    if (!val) return;
    currentTopics.push(val);
    qs("#prAddTopicInput").value = "";
    qs("#prTopicsWrap").style.display = "block";
    qs("#prTopicCount").textContent = currentTopics.length;
    renderTopicList();
    qs("#prGenerate").disabled = false;
  });

  qs("#prPdfSelect").addEventListener("change", async (e) => {
    const val = e.target.value;
    qs("#prNewFileRow").style.display = val === "__new__" ? "flex" : "none";
    if (val !== "__new__") {
      const res = existingPdfs.find((p) => p.id === val);
      const buf = await res.blob.arrayBuffer();
      await processFile(buf, res.title);
    } else {
      currentTopics = [];
      qs("#prTopicsWrap").style.display = "none";
      qs("#prGenerate").disabled = true;
    }
  });

  qs("#prFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await processFile(buf, file.name.replace(/\.[^.]+$/, ""));
    qs("#prFileInput").dataset.pendingSave = "1";
  });

  qs("#prGenerate").addEventListener("click", async () => {
    if (currentTopics.length === 0) { toast(t("pr_noTopics")); return; }
    const start = qs("#prStart").value;
    const end = qs("#prEnd").value;
    const perDay = parseInt(qs("#prPerDay").value, 10) || 3;
    if (!start) { toast(t("pr_startRequired")); return; }

    const fileInput = qs("#prFileInput");
    if (fileInput.files[0] && qs("#prPdfSelect").value === "__new__") {
      await DB.put(DB.STORES.resources, {
        id: uid(), sectorId: sector.id, type: "pdf", title: sourceTitle,
        blob: fileInput.files[0], mime: "application/pdf", size: fileInput.files[0].size, addedAt: Date.now(), folderId: null,
      });
    }

    const { subjectId, topicId } = cascadeValues("prCasc");
    const scheduleItems = RoutineGen.buildSchedule({
      topics: currentTopics, sectorId: sector.id, sourceTitle,
      startDate: start, endDate: end || null, perDayCount: perDay,
      subjectId, topicId,
    });
    for (const it of scheduleItems) await DB.put(DB.STORES.routine, it);
    closeModal();
    state.currentView.tab = "routine";
    renderSectorView();
    toast(`${scheduleItems.length} ${t("pr_generated")}`);
  });
}

/* ===================== Jobs / applications ===================== */
async function renderSectorJobs(sector, content) {
  const jobs = await DB.byIndex(DB.STORES.jobs, "sectorId", sector.id);
  jobs.sort((a, b) => (a.examDate || "9999").localeCompare(b.examDate || "9999"));

  content.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <button class="btn btn-accent" id="btnAddJob">${t("jobs_add")}</button>
    </div>
    ${jobs.length === 0 ? `<div class="empty-state">${t("jobs_empty")}</div>` : `
    <div class="card" style="padding:0;overflow-x:auto;">
      <table class="data-table">
        <thead><tr>
          <th>${t("jobs_th_title")}</th><th>${t("jobs_th_authority")}</th><th>${t("jobs_th_applyDeadline")}</th><th>${t("jobs_th_examDate")}</th><th>${t("jobs_th_txn")}</th><th>${t("jobs_th_status")}</th><th></th>
        </tr></thead>
        <tbody id="jobsTbody"></tbody>
      </table>
    </div>`}
  `;

  if (jobs.length) {
    const tbody = qs("#jobsTbody");
    jobs.forEach((j) => {
      const tr = document.createElement("tr");
      const d = j.examDate ? daysUntil(j.examDate) : null;
      tr.innerHTML = `
        <td><strong>${escapeHtml(j.jobTitle)}</strong>${j.notes ? `<div class="muted" style="font-size:11.5px;margin-top:2px;">${escapeHtml(j.notes)}</div>` : ""}</td>
        <td>${escapeHtml(j.examAuthority || "—")}</td>
        <td>${j.applyDeadline ? fmtDate(j.applyDeadline) : "—"}</td>
        <td>${j.examDate ? `${fmtDate(j.examDate)}${d !== null ? `<div class="muted" style="font-size:11.5px;">${d===0?t("dash_today"):d>0?toNum(d)+" "+t("dash_daysLeft"):toNum(Math.abs(d))+" "+t("rt_dayBefore")}</div>` : ""}` : "—"}</td>
        <td>${escapeHtml(j.transactionId || "—")}</td>
        <td><span class="status-pill ${j.status || "pending"}">${statusLabel(j.status)}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-act="edit">✎</button>
          <button class="btn btn-sm btn-danger" data-act="del">✕</button>
        </td>
      `;
      qs('[data-act="edit"]', tr).addEventListener("click", () => openJobFormModal(sector.id, j));
      qs('[data-act="del"]', tr).addEventListener("click", async () => {
        if (!confirm(`"${j.jobTitle}" ${t("jobs_deleteConfirm")}`)) return;
        await DB.delete(DB.STORES.jobs, j.id);
        rerenderCurrentView();
      });
      tbody.appendChild(tr);
    });
  }

  qs("#btnAddJob").addEventListener("click", () => openJobFormModal(sector.id));
}

function statusLabel(status) {
  return t(`jobs_status_${status || "pending"}`);
}

function openJobFormModal(sectorId, existing = null) {
  const isEdit = !!existing;
  openModal(`
    <h3 class="modal-title">${isEdit ? t("jobs_formTitleEdit") : t("jobs_formTitleNew")}</h3>
    <div class="form-row"><label>${t("jobs_jobTitle")}</label><input type="text" id="jTitle" value="${isEdit ? escapeHtml(existing.jobTitle) : ""}" placeholder="${t("jobs_jobTitlePh")}" /></div>
    <div class="form-row"><label>${t("jobs_authority")}</label><input type="text" id="jAuthority" value="${isEdit ? escapeHtml(existing.examAuthority||"") : ""}" placeholder="${t("jobs_authorityPh")}" /></div>
    <div class="form-row form-grid2">
      <div><label>${t("jobs_th_applyDeadline")}</label><input type="date" id="jApplyDeadline" value="${isEdit ? existing.applyDeadline||"" : ""}" /></div>
      <div><label>${t("jobs_th_examDate")}</label><input type="date" id="jExamDate" value="${isEdit ? existing.examDate||"" : ""}" /></div>
    </div>
    <div class="form-row form-grid2">
      <div><label>${t("jobs_applyDate")}</label><input type="date" id="jApplyDate" value="${isEdit ? existing.applyDate||"" : ""}" /></div>
      <div><label>${t("jobs_txn")}</label><input type="text" id="jTxn" value="${isEdit ? escapeHtml(existing.transactionId||"") : ""}" placeholder="${t("jobs_txnPh")}" /></div>
    </div>
    <div class="form-row">
      <label>${t("jobs_status")}</label>
      <select id="jStatus">
        <option value="pending" ${existing?.status==="pending"||!existing?.status?"selected":""}>${t("jobs_status_pending")}</option>
        <option value="applied" ${existing?.status==="applied"?"selected":""}>${t("jobs_status_applied")}</option>
        <option value="admit" ${existing?.status==="admit"?"selected":""}>${t("jobs_status_admit")}</option>
        <option value="done" ${existing?.status==="done"?"selected":""}>${t("jobs_status_done")}</option>
      </select>
    </div>
    <div class="form-row"><label>${t("jobs_notes")}</label><textarea id="jNotes" rows="2">${isEdit ? escapeHtml(existing.notes||"") : ""}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="jCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="jSave">${t("common_save")}</button>
    </div>
  `, { wide: true });

  qs("#jCancel").addEventListener("click", closeModal);
  qs("#jSave").addEventListener("click", async () => {
    const jobTitle = qs("#jTitle").value.trim();
    if (!jobTitle) { toast(t("jobs_titleRequired")); return; }
    const job = existing || { id: uid(), sectorId, createdAt: Date.now() };
    job.jobTitle = jobTitle;
    job.examAuthority = qs("#jAuthority").value.trim();
    job.applyDeadline = qs("#jApplyDeadline").value;
    job.examDate = qs("#jExamDate").value;
    job.applyDate = qs("#jApplyDate").value;
    job.transactionId = qs("#jTxn").value.trim();
    job.status = qs("#jStatus").value;
    job.notes = qs("#jNotes").value.trim();
    await DB.put(DB.STORES.jobs, job);
    closeModal();
    rerenderCurrentView();
    toast(isEdit ? t("jobs_updated") : t("jobs_added"));
  });
}

/* ===================== Focus history ===================== */
async function renderSectorFocusHistory(sector, content) {
  const logs = await DB.byIndex(DB.STORES.focusLogs, "sectorId", sector.id);
  logs.sort((a, b) => b.createdAt - a.createdAt);
  const totalMin = logs.reduce((s, l) => s + l.minutes, 0);

  content.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="muted" style="font-size:12px;">${t("focus_totalTime")}</div>
      <div style="font-size:24px;font-weight:700;">${toNum(totalMin)} ${t("ov_minutes")} (${toNum(logs.length)} ${t("focus_sessions")})</div>
      <div class="field-hint" style="margin-top:6px;">${t("focus_hint")}</div>
    </div>
    ${logs.length === 0 ? `<div class="empty-state">${t("focus_empty")}</div>` : `
    <div class="card" style="padding:0;">
      <table class="data-table"><thead><tr><th>${t("focus_th_date")}</th><th>${t("focus_th_duration")}</th></tr></thead>
      <tbody>${logs.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${toNum(l.minutes)} ${t("ov_minutes")}</td></tr>`).join("")}</tbody></table>
    </div>`}
  `;
}

/* ===================== Sticky notes (global) ===================== */
const STICKY_COLORS = ["#3a3320", "#233128", "#2a2436", "#332322", "#22303a"];
const STICKY_COLORS_LIGHT = ["#fdf3d4", "#dcf0e6", "#ece2f7", "#fbe2df", "#dcecf7"];

async function renderStickyNotesView() {
  const main = qs("#mainView");
  main.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">${t("sticky_title")}</h1><p class="page-subtitle">${t("sticky_subtitle")}</p></div>
      <button class="btn btn-accent" id="btnAddSticky">${t("sticky_add")}</button>
    </div>
    <div class="sticky-grid" id="stickyGrid"></div>
  `;
  qs("#btnAddSticky").addEventListener("click", () => openStickyFormModal());

  const notes = (await DB.all(DB.STORES.stickyNotes)).sort((a, b) => b.createdAt - a.createdAt);
  const grid = qs("#stickyGrid");
  if (notes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${t("sticky_empty")}</div>`;
    return;
  }
  const palette = currentTheme() === "light" || currentTheme() === "sepia" ? STICKY_COLORS_LIGHT : STICKY_COLORS;
  notes.forEach((n, idx) => {
    const sector = state.sectors.find((s) => s.id === n.sectorId);
    const tagBits = [sector ? escapeHtml(sector.name) : null, n.subjectName ? escapeHtml(n.subjectName) : null, n.topicName ? escapeHtml(n.topicName) : null].filter(Boolean);
    const card = document.createElement("div");
    card.className = "sticky-note";
    card.style.background = palette[idx % palette.length];
    card.innerHTML = `
      <div class="sticky-note-text">${escapeHtml(n.text)}</div>
      <div class="sticky-note-footer">
        <span>${tagBits.join(" › ")}</span>
        <span style="display:flex;gap:6px;">${speakBtn(n.text)}<button data-del>✕</button></span>
      </div>
    `;
    qs("[data-del]", card).addEventListener("click", async () => {
      await DB.delete(DB.STORES.stickyNotes, n.id);
      toast(t("sticky_deleted"));
      renderStickyNotesView();
    });
    grid.appendChild(card);
  });
}

function openStickyFormModal() {
  openModal(`
    <h3 class="modal-title">${t("sticky_add")}</h3>
    <div class="form-row"><textarea id="stickyText" rows="4" placeholder="${t("sticky_placeholder")}"></textarea></div>
    ${cascadeSelectHTML("stickyCasc", {})}
    <div class="form-actions">
      <button class="btn btn-ghost" id="stickyCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="stickySave">${t("common_save")}</button>
    </div>
  `);
  wireCascadeSelect("stickyCasc", {});
  qs("#stickyCancel").addEventListener("click", closeModal);
  qs("#stickySave").addEventListener("click", async () => {
    const text = qs("#stickyText").value.trim();
    if (!text) return;
    const { sectorId, subjectId, topicId } = cascadeValues("stickyCasc");
    const names = await lookupSubjectTopicNames(subjectId, topicId);
    await DB.put(DB.STORES.stickyNotes, {
      id: uid(), text, sectorId, subjectId, topicId,
      subjectName: names.subject || null, topicName: names.topic || null,
      createdAt: Date.now(),
    });
    closeModal();
    renderStickyNotesView();
  });
}

/* ===================== Study diary (global) ===================== */
async function renderDiaryView() {
  const main = qs("#mainView");
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  main.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">${t("diary_title")}</h1><p class="page-subtitle">${t("diary_subtitle")}</p></div>
    </div>
    <div class="diary-col-grid">
      <div class="card">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:10px;">${t("diary_todayLabel")}</div>
        <div id="diaryTodayList"></div>
        <button class="btn btn-sm btn-accent" style="margin-top:10px;" id="btnAddDiaryToday">${t("diary_addToday")}</button>
      </div>
      <div class="card">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:10px;">${t("diary_tomorrowLabel")}</div>
        <div id="diaryTomorrowList"></div>
        <button class="btn btn-sm btn-accent" style="margin-top:10px;" id="btnAddDiaryTomorrow">${t("diary_addTomorrow")}</button>
      </div>
    </div>
    <h2 class="section-title">${t("diary_allHistory")}</h2>
    <div class="card" id="diaryHistoryCard"></div>
  `;

  qs("#btnAddDiaryToday").addEventListener("click", () => openDiaryEntryModal(today));
  qs("#btnAddDiaryTomorrow").addEventListener("click", () => openDiaryEntryModal(tomorrow));

  const all = (await DB.all(DB.STORES.studyLog)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const todayEntries = all.filter((e) => e.date === today);
  const tomorrowEntries = all.filter((e) => e.date === tomorrow);
  const historyEntries = all.filter((e) => e.date !== today && e.date !== tomorrow);

  qs("#diaryTodayList").innerHTML = todayEntries.length ? todayEntries.map((e) => diaryEntryHtml(e, { allowDelete: true })).join("") : `<div class="muted" style="font-size:12.5px;">${t("diary_empty")}</div>`;
  qs("#diaryTomorrowList").innerHTML = tomorrowEntries.length ? tomorrowEntries.map((e) => diaryEntryHtml(e, { allowDelete: true })).join("") : `<div class="muted" style="font-size:12.5px;">${t("diary_empty")}</div>`;

  if (historyEntries.length) {
    const byDate = {};
    historyEntries.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    qs("#diaryHistoryCard").innerHTML = Object.keys(byDate).sort().reverse().map((d) => `
      <div style="margin-bottom:6px;margin-top:14px;font-size:11.5px;color:var(--text-muted);">${fmtDate(d)}</div>
      ${byDate[d].map((e) => diaryEntryHtml(e, { allowDelete: true })).join("")}
    `).join("");
  } else {
    qs("#diaryHistoryCard").innerHTML = `<div class="muted">${t("diary_empty")}</div>`;
  }

  wireDiaryEntryCheckboxes(main);
}

function openDiaryEntryModal(date) {
  openModal(`
    <h3 class="modal-title">${fmtDate(date)}</h3>
    ${cascadeSelectHTML("diaryCasc", {})}
    <div class="form-row" style="margin-top:14px;"><label>${t("diary_text")}</label><textarea id="dText" rows="3" placeholder="${t("diary_textPh")}"></textarea></div>
    <div class="form-row">
      <label>${t("diary_linkMaterial")}</label>
      <select id="dMaterial"><option value="">${t("diary_none")}</option></select>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="dCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="dSave">${t("common_add")}</button>
    </div>
  `, { wide: true });

  wireCascadeSelect("diaryCasc", {});

  async function populateMaterials(sectorId) {
    const sel = qs("#dMaterial");
    sel.innerHTML = `<option value="">${t("diary_none")}</option>`;
    if (!sectorId) return;
    const res = (await DB.byIndex(DB.STORES.resources, "sectorId", sectorId)).filter((r) => r.type !== "picture");
    res.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id; opt.textContent = r.title;
      sel.appendChild(opt);
    });
  }
  qs("#diaryCascSector").addEventListener("change", (e) => populateMaterials(e.target.value));

  qs("#dCancel").addEventListener("click", closeModal);
  qs("#dSave").addEventListener("click", async () => {
    const text = qs("#dText").value.trim();
    if (!text) { toast(t("diary_textRequired")); return; }
    const { sectorId, subjectId, topicId } = cascadeValues("diaryCasc");
    const materialSel = qs("#dMaterial");
    const materialId = materialSel.value || null;
    const materialTitle = materialId ? materialSel.options[materialSel.selectedIndex].textContent : null;
    const names = await lookupSubjectTopicNames(subjectId, topicId);
    await DB.put(DB.STORES.studyLog, {
      id: uid(), date, sectorId, subjectId, topicId,
      subjectName: names.subject || null, topicName: names.topic || null,
      text, materialId, materialTitle, done: false, createdAt: Date.now(),
    });
    closeModal();
    toast(t("diary_added"));
    rerenderCurrentView();
  });
}

/* ===================== Dictionary (global) ===================== */
async function renderDictionaryView() {
  const main = qs("#mainView");
  main.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">${t("dict_title")}</h1><p class="page-subtitle">${t("dict_subtitle")}</p></div>
      <div style="display:flex;gap:8px;">
        <button class="btn" id="btnManageDictWords">${t("dict_manageOwn")}</button>
        <button class="btn btn-accent" id="btnAddDictWord">${t("dict_addOwn")}</button>
      </div>
    </div>
    <div class="dict-search-row">
      <input type="text" id="dictSearchInput" placeholder="${t("dict_searchPh")}" autofocus />
    </div>
    <div class="card" id="dictResults"></div>
  `;
  const resultsBox = qs("#dictResults");

  async function runSearch(q) {
    if (!q.trim()) { resultsBox.innerHTML = ""; return; }
    const results = await Dictionary.search(q);
    if (results.length === 0) { resultsBox.innerHTML = `<div class="empty-state">${t("dict_noResult")}</div>`; return; }
    resultsBox.innerHTML = results.map((r) => `
      <div class="dict-result">
        <div class="dict-result-body">
          <div class="dict-result-headrow">
            <span class="dict-result-word">${escapeHtml(r.word)}</span>
            ${r.pos ? `<span class="dict-result-pos">${escapeHtml(r.pos)}</span>` : ""}
            <span class="dict-result-tag">${r.custom ? t("dict_custom") : t("dict_builtIn")}</span>
            ${speakBtn(r.word)}
            ${r.custom ? `<button class="speak-btn dict-del-btn" data-dict-del="${r.id}" title="${t("common_delete")}">🗑</button>` : ""}
          </div>
          ${r.bnMeaning ? `<div class="dict-result-bn">${escapeHtml(r.bnMeaning)}</div>` : ""}
          ${r.enMeaning ? `<div class="dict-result-def">${escapeHtml(r.enMeaning)}</div>` : ""}
          ${r.synonyms ? `<div class="dict-result-syn"><strong>${t("dict_synonyms")}:</strong> ${escapeHtml(r.synonyms)}</div>` : ""}
          ${r.example ? `<div class="dict-result-example">“${escapeHtml(r.example)}” ${speakBtn(r.example)}</div>` : ""}
        </div>
      </div>
    `).join("");

    qsa("[data-dict-del]", resultsBox).forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(t("dict_deleteConfirm"))) return;
        await Dictionary.deleteCustom(btn.dataset.dictDel);
        toast(t("dict_deleted"));
        runSearch(qs("#dictSearchInput").value);
      });
    });
  }

  qs("#dictSearchInput").addEventListener("input", (e) => runSearch(e.target.value));
  qs("#btnAddDictWord").addEventListener("click", () => openDictAddModal());
  qs("#btnManageDictWords").addEventListener("click", () => openDictManageModal());
}

function openDictAddModal() {
  openModal(`
    <h3 class="modal-title">${t("dict_addOwn")}</h3>
    <div class="form-row"><label>${t("dict_word")}</label><input type="text" id="dwWord" /></div>
    <div class="form-row">
      <label>${t("dict_pos")}</label>
      <select id="dwPos">
        <option value="">—</option>
        <option value="noun">${t("dict_pos_noun")}</option>
        <option value="verb">${t("dict_pos_verb")}</option>
        <option value="adjective">${t("dict_pos_adjective")}</option>
        <option value="adverb">${t("dict_pos_adverb")}</option>
        <option value="preposition">${t("dict_pos_preposition")}</option>
        <option value="other">${t("dict_pos_other")}</option>
      </select>
    </div>
    <div class="form-row"><label>${t("dict_bnMeaning")}</label><input type="text" id="dwBn" placeholder="${t("dict_bnMeaningPh")}" /></div>
    <div class="form-row"><label>${t("dict_enMeaning")}</label><textarea id="dwEn" rows="2" placeholder="${t("dict_enMeaningPh")}"></textarea></div>
    <div class="form-row"><label>${t("dict_synonyms")}</label><input type="text" id="dwSyn" placeholder="${t("dict_synonymsPh")}" /></div>
    <div class="form-row"><label>${t("dict_example")}</label><textarea id="dwExample" rows="2" placeholder="${t("dict_examplePh")}"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="dwCancel">${t("common_cancel")}</button>
      <button class="btn btn-accent" id="dwSave">${t("common_save")}</button>
    </div>
  `);
  qs("#dwCancel").addEventListener("click", closeModal);
  qs("#dwSave").addEventListener("click", async () => {
    const word = qs("#dwWord").value.trim();
    const bnMeaning = qs("#dwBn").value.trim();
    const enMeaning = qs("#dwEn").value.trim();
    if (!word || (!bnMeaning && !enMeaning)) { toast(t("dict_wordRequired")); return; }
    await Dictionary.addCustom({
      word, bnMeaning, enMeaning,
      pos: qs("#dwPos").value,
      synonyms: qs("#dwSyn").value.trim(),
      example: qs("#dwExample").value.trim(),
    });
    closeModal();
    toast(t("dict_added"));
  });
}

async function openDictManageModal() {
  const words = await Dictionary.listCustom();
  openModal(`
    <h3 class="modal-title">${t("dict_manageTitle")}</h3>
    <p class="field-hint" style="margin-bottom:12px;">${t("dict_manageSubtitle")}</p>
    <div id="dictManageList" style="max-height:50vh;overflow-y:auto;"></div>
    <div class="form-actions">
      <button class="btn btn-accent" id="dictManageClose">${t("common_close")}</button>
    </div>
  `, { wide: true });

  function renderList(list) {
    const box = qs("#dictManageList");
    if (list.length === 0) {
      box.innerHTML = `<div class="empty-state">${t("dict_noCustom")}</div>`;
      return;
    }
    box.innerHTML = list.map((w) => `
      <div class="resource-row" data-manage-id="${w.id}">
        <div style="flex:1;min-width:0;">
          <div class="resource-name">${escapeHtml(w.word)} ${w.pos ? `<span class="dict-result-pos">${escapeHtml(w.pos)}</span>` : ""}</div>
          <div class="resource-meta">${escapeHtml(w.bnMeaning || w.enMeaning || "")}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-manage-del="${w.id}">${t("common_delete")}</button>
      </div>
    `).join("");
    qsa("[data-manage-del]", box).forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(t("dict_deleteConfirm"))) return;
        await Dictionary.deleteCustom(btn.dataset.manageDel);
        toast(t("dict_deleted"));
        renderList(await Dictionary.listCustom());
      });
    });
  }

  renderList(words);
  qs("#dictManageClose").addEventListener("click", () => { closeModal(); rerenderCurrentView(); });
}

/* ===================== Settings / backup ===================== */
function renderSettingsView() {
  const main = qs("#mainView");
  const theme = currentTheme();
  main.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">${t("set_title")}</h1><p class="page-subtitle">${t("set_subtitle")}</p></div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_theme")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_themeDesc")}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn ${theme==="dark"?"btn-accent":""}" data-theme-btn="dark">${t("set_theme_dark")}</button>
        <button class="btn ${theme==="light"?"btn-accent":""}" data-theme-btn="light">${t("set_theme_light")}</button>
        <button class="btn ${theme==="sepia"?"btn-accent":""}" data-theme-btn="sepia">${t("set_theme_sepia")}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_accent")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_accentDesc")}</p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${ACCENT_PRESETS.map((c) => `<span class="accent-swatch ${currentAccent().toLowerCase() === c.toLowerCase() ? "selected" : ""}" data-accent-swatch="${c}" style="background:${c};"></span>`).join("")}
        <label class="accent-custom-label">
          <input type="color" id="accentCustomInput" value="${currentAccent()}" />
        </label>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_bgPhoto")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_bgPhotoDesc")}</p>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
        <input type="file" id="bgPhotoInput" accept="image/*" />
        <button class="btn btn-danger btn-sm" id="btnClearBgPhoto">${t("set_bgPhotoRemove")}</button>
      </div>
      <label style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:10px;">
        ${t("set_bgPhotoOpacity")}
        <input type="range" id="bgOpacityInput" min="0" max="40" value="${currentBgOpacity()}" style="flex:1;" />
        <span id="bgOpacityValue">${currentBgOpacity()}%</span>
      </label>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_language")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_languageDesc")}</p>
      <div style="display:flex;gap:8px;">
        <button class="btn ${isBn()?"btn-accent":""}" id="langBtnBn">বাংলা</button>
        <button class="btn ${!isBn()?"btn-accent":""}" id="langBtnEn">English</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_export")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_exportDesc")}</p>
      <button class="btn btn-accent" id="btnExport">${t("set_exportBtn")}</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-top:0;font-size:14.5px;">${t("set_import")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_importDesc")}</p>
      <input type="file" id="importFile" accept="application/json" />
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:14.5px;color:var(--urgent);">${t("set_clearAll")}</h3>
      <p class="muted" style="font-size:13px;">${t("set_clearAllDesc")}</p>
      <button class="btn btn-danger" id="btnClearAll">${t("set_clearAllBtn")}</button>
    </div>
  `;

  qsa("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => { applyTheme(btn.dataset.themeBtn); renderSettingsView(); rerenderCurrentView(); });
  });
  qsa("[data-accent-swatch]").forEach((sw) => {
    sw.addEventListener("click", () => { applyAccent(sw.dataset.accentSwatch); renderSettingsView(); rerenderCurrentView(); });
  });
  qs("#accentCustomInput").addEventListener("input", (e) => { applyAccent(e.target.value); });
  qs("#accentCustomInput").addEventListener("change", () => { renderSettingsView(); rerenderCurrentView(); });

  qs("#bgPhotoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await setBackgroundPhoto(file);
    toast(t("set_bgPhotoAdded"));
  });
  qs("#btnClearBgPhoto").addEventListener("click", async () => {
    await clearBackgroundPhoto();
    toast(t("set_bgPhotoRemoved"));
  });
  qs("#bgOpacityInput").addEventListener("input", (e) => {
    applyBgOpacity(parseInt(e.target.value, 10));
    qs("#bgOpacityValue").textContent = `${e.target.value}%`;
  });
  qs("#langBtnBn").addEventListener("click", () => setLanguage("bn"));
  qs("#langBtnEn").addEventListener("click", () => setLanguage("en"));

  qs("#btnExport").addEventListener("click", async () => {
    const dump = await DB.exportAll();
    for (const key of ["resources"]) {
      for (const item of dump[key]) {
        if (item.blob instanceof Blob) {
          item.blobBase64 = await blobToBase64(item.blob);
          delete item.blob;
        }
      }
    }
    const jsonStr = JSON.stringify(dump);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jobprep-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    toast(t("set_exportDone"));
  });

  qs("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      for (const item of dump.resources || []) {
        if (item.blobBase64) {
          item.blob = await base64ToBlob(item.blobBase64, item.mime);
          delete item.blobBase64;
        }
      }
      await DB.importAll(dump);
      await refreshSectors();
      renderSidebar();
      navigateDashboard();
      toast(t("set_importDone"));
    } catch (err) {
      console.error(err);
      toast(t("set_importFail"));
    }
  });

  qs("#btnClearAll").addEventListener("click", async () => {
    const word = prompt(t("set_clearAllPrompt"));
    if (word !== t("set_clearAllWord")) return;
    await DB.clearAll();
    await refreshSectors();
    renderSidebar();
    navigateDashboard();
    toast(t("set_clearedAll"));
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function base64ToBlob(dataUrl, mime) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/* ===================== ফুলস্ক্রিন প্রিমিয়াম ফোকাস মোড ===================== */
const FF_RING_CIRCUMFERENCE = 2 * Math.PI * 100;

function updateFullscreenRing(remaining, total) {
  const ring = qs("#ffRingProgress");
  if (!ring || !total) return;
  const pct = Math.max(0, Math.min(1, remaining / total));
  ring.style.strokeDasharray = `${FF_RING_CIRCUMFERENCE}`;
  ring.style.strokeDashoffset = `${FF_RING_CIRCUMFERENCE * (1 - pct)}`;
}

function isFullscreenFocusOpen() {
  const el = qs("#focusFullscreen");
  return el && !el.classList.contains("hidden");
}

async function openFocusFullscreen() {
  const info = Focus.getSessionInfo();
  const sector = state.sectors.find((s) => s.id === info.sectorId);
  const names = await lookupSubjectTopicNames(info.subjectId, info.topicId);
  const parts = [sector?.name, names.subject, names.topic].filter(Boolean);
  qs("#ffContext").textContent = parts.length ? parts.join(" → ") : t("ff_defaultContext");
  qs("#ffTimerDisplay").textContent = qs("#fdTimerDisplay").textContent;
  qs("#ffTimerMode").textContent = qs("#fdTimerMode").textContent;
  qs("#ffPause").textContent = qs("#fdPause").textContent;
  updateFullscreenRing(info.remaining, info.total);
  qs("#focusFullscreen").classList.remove("hidden");
}

function closeFocusFullscreen() {
  qs("#focusFullscreen").classList.add("hidden");
}

function syncPauseButtonsLabel(text) {
  qs("#fdPause").textContent = text;
  const ffBtn = qs("#ffPause");
  if (ffBtn) ffBtn.textContent = text;
}

/* ===================== Focus dock wiring ===================== */
function setupFocusDock() {
  const toggle = qs("#focusDockToggle");
  const panel = qs("#focusDockPanel");
  const calcToggle = qs("#calcDockToggle");
  const calcPanel = qs("#calcDockPanel");

  function openFocusPage() {
    panel.classList.add("open"); toggle.classList.add("open");
    calcPanel.classList.remove("open"); calcToggle.classList.remove("open");
    document.body.classList.add("tool-page-locked");
  }
  function closeFocusPage() {
    panel.classList.remove("open"); toggle.classList.remove("open");
    if (!calcPanel.classList.contains("open")) document.body.classList.remove("tool-page-locked");
  }
  toggle.addEventListener("click", () => {
    if (panel.classList.contains("open")) closeFocusPage(); else openFocusPage();
  });
  qs("#focusPageBack").addEventListener("click", closeFocusPage);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closeFocusPage();
  });

  qsa(".fdt").forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".fdt").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const which = btn.dataset.fdtab;
      qs("#fdTimerPane").classList.toggle("hidden", which !== "timer");
      qs("#fdStopwatchPane").classList.toggle("hidden", which !== "stopwatch");
    });
  });

  // সেক্টর → সাবজেক্ট → টপিক cascading dropdown, ফোকাস সেশনের সাথে ট্যাগ করার জন্য
  qs("#fdCascadeWrap").innerHTML = cascadeSelectHTML("fdCasc", {});
  wireCascadeSelect("fdCasc", {});
  if (state.currentView.type === "sector") {
    const sel = qs("#fdCascSector");
    if (sel) { sel.value = state.currentView.sectorId; sel.dispatchEvent(new Event("change")); }
  }
  document.addEventListener("app:sectorsChanged", () => {
    qs("#fdCascadeWrap").innerHTML = cascadeSelectHTML("fdCasc", {});
    wireCascadeSelect("fdCasc", {});
  });

  function onFocusTick(display, remaining, total) {
    qs("#fdTimerDisplay").textContent = display;
    if (isFullscreenFocusOpen()) {
      qs("#ffTimerDisplay").textContent = display;
      updateFullscreenRing(remaining, total);
    }
  }
  function onFocusEnd(sectorId) {
    qs("#fdTimerMode").textContent = t("focusDock_ended");
    qs("#fdStart").disabled = false;
    qs("#fdPause").disabled = true;
    if (isFullscreenFocusOpen()) {
      qs("#ffTimerMode").textContent = t("focusDock_ended");
    }
    if (state.currentView.type === "sector" && state.currentView.sectorId === sectorId) renderSectorView();
  }

  function startFocusSession() {
    const minutes = parseFloat(qs("#fdMinutesInput").value) || 25;
    const { sectorId, subjectId, topicId } = cascadeValues("fdCasc");
    Focus.startFocus({ minutes, sectorId, subjectId, topicId, mode: "focus" }, onFocusTick, () => onFocusEnd(sectorId));
    qs("#fdTimerMode").textContent = t("focusDock_running");
    qs("#fdStart").disabled = true;
    qs("#fdPause").disabled = false;
    syncPauseButtonsLabel(t("focusDock_pause"));
  }

  qs("#fdStart").addEventListener("click", startFocusSession);

  function togglePauseResume() {
    if (Focus.isFocusRunning()) {
      Focus.pauseFocus();
      syncPauseButtonsLabel(t("focusDock_resume"));
      qs("#fdTimerMode").textContent = t("focusDock_paused");
      if (isFullscreenFocusOpen()) qs("#ffTimerMode").textContent = t("focusDock_paused");
    } else {
      Focus.resumeFocus();
      syncPauseButtonsLabel(t("focusDock_pause"));
      qs("#fdTimerMode").textContent = t("focusDock_running");
      if (isFullscreenFocusOpen()) qs("#ffTimerMode").textContent = t("focusDock_running");
    }
  }
  qs("#fdPause").addEventListener("click", togglePauseResume);
  qs("#ffPause").addEventListener("click", togglePauseResume);

  function endFocusSession() {
    Focus.cancelFocus();
    qs("#fdTimerDisplay").textContent = `${String(qs("#fdMinutesInput").value).padStart(2,"0")}:00`;
    qs("#fdTimerMode").textContent = t("focusDock_session");
    qs("#fdStart").disabled = false;
    qs("#fdPause").disabled = true;
    syncPauseButtonsLabel(t("focusDock_pause"));
    closeFocusFullscreen();
  }
  qs("#fdReset").addEventListener("click", endFocusSession);
  qs("#ffEnd").addEventListener("click", endFocusSession);

  qs("#fdEnterFullscreen").addEventListener("click", async () => {
    if (!Focus.getSessionInfo().active) startFocusSession();
    await openFocusFullscreen();
    closeFocusPage();
  });
  qs("#ffExitBtn").addEventListener("click", closeFocusFullscreen);

  qs("#fdSwStart").addEventListener("click", () => {
    Focus.startStopwatch((display) => { qs("#fdSwDisplay").textContent = display; });
    qs("#fdSwStart").disabled = true;
    qs("#fdSwPause").disabled = false;
  });
  qs("#fdSwPause").addEventListener("click", () => {
    Focus.pauseStopwatch();
    qs("#fdSwStart").disabled = false;
    qs("#fdSwPause").disabled = true;
  });
  qs("#fdSwReset").addEventListener("click", () => {
    Focus.resetStopwatch();
    qs("#fdSwDisplay").textContent = "00:00";
    qs("#fdSwStart").disabled = false;
    qs("#fdSwPause").disabled = true;
  });
}

function applyFocusDockLabels() {
  qs("#fdTabTimer").textContent = t("focusDock_timer");
  qs("#fdTabStopwatch").textContent = t("focusDock_stopwatch");
  qs("#fdTimerMode").textContent = t("focusDock_session");
  qs("#fdMinutesLabel").childNodes[0].textContent = t("focusDock_minutes") + " ";
  qs("#fdStart").textContent = t("focusDock_start");
  qs("#fdPause").textContent = t("focusDock_pause");
  qs("#fdReset").textContent = t("focusDock_reset");
  qs("#fdSwStart").textContent = t("focusDock_start");
  qs("#fdSwPause").textContent = t("focusDock_pause");
  qs("#fdSwReset").textContent = t("focusDock_reset");
  qs("#fdFullscreenLabel").textContent = t("focusDock_fullscreenBtn");
  qs("#ffExitBtn").title = t("ff_exitTitle");
  qs("#ffEnd").textContent = t("ff_endSession");
}

/* ===================== Init ===================== */
async function init() {
  applyTheme(currentTheme());
  applyAccent(currentAccent());
  await loadBackgroundPhoto();
  applyStaticI18n();
  applyFocusDockLabels();
  tickClock();
  await refreshSectors();
  renderSidebar();
  setupFocusDock();
  setupCalculatorDock();
  setupMobileBottomNav();
  navigateDashboard();

  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
