/* calendar.js — মাস-ভিত্তিক ক্যালেন্ডার আঁকার জন্য একটা সাধারণ, পুনর্ব্যবহারযোগ্য ফাংশন।
   ডেটা (কোন তারিখে কী আছে) কলার সাইড থেকে সরবরাহ করা হয়। */

function renderMonthCalendar({ container, year, month, eventsByDate, onDayClick, todayStr }) {
  const BN_MONTHS = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
  const EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const BN_WD = ["রবি","সোম","মঙ্গল","বুধ","বৃহ","শুক্র","শনি"];
  const EN_WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const isBn = (window.LangState ? window.LangState.current : "bn") === "bn";
  const monthNames = isBn ? BN_MONTHS : EN_MONTHS;
  const wdNames = isBn ? BN_WD : EN_WD;
  const digits = isBn ? ["০","১","২","৩","৪","৫","৬","৭","৮","৯"] : null;
  const num = (n) => (digits ? String(n).replace(/\d/g, (d) => digits[d]) : String(n));

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = "";
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell cal-cell-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const evts = eventsByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const dotColor = evts.length ? (evts.some((e) => e.kind === "exam") ? "var(--urgent)" : evts.some((e) => e.kind === "deadline") ? "var(--accent)" : "var(--info)") : "";
    cells += `<div class="cal-cell ${isToday ? "cal-today" : ""} ${evts.length ? "cal-has-event" : ""}" data-date="${dateStr}">
      <span class="cal-daynum">${num(d)}</span>
      ${evts.length ? `<span class="cal-dot" style="background:${dotColor}"></span>` : ""}
    </div>`;
  }

  container.innerHTML = `
    <div class="cal-header">
      <button class="btn btn-sm btn-ghost" id="calPrevBtn">◀</button>
      <div class="cal-header-title">${monthNames[month]} ${num(year)}</div>
      <button class="btn btn-sm btn-ghost" id="calNextBtn">▶</button>
    </div>
    <div class="cal-grid cal-weekdays">${wdNames.map((w) => `<div class="cal-wd">${w}</div>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <div id="calDayDetail" class="cal-day-detail"></div>
  `;

  container.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => {
      container.querySelectorAll(".cal-cell").forEach((c) => c.classList.remove("cal-selected"));
      cell.classList.add("cal-selected");
      if (onDayClick) onDayClick(cell.dataset.date, eventsByDate[cell.dataset.date] || []);
    });
  });
}

window.renderMonthCalendar = renderMonthCalendar;
