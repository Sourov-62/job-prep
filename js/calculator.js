/* calculator.js — ছোট হিসাবনিকাশ ক্যালকুলেটর। eval() ব্যবহার করা হয়নি,
   সাধারণ ক্যালকুলেটরের মতো ধাপে ধাপে হিসাব করে। */

const Calc = (() => {
  let display = "0";
  let acc = null;
  let pendingOp = null;
  let justEvaluated = false;

  function apply(a, b, op) {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function formatNum(n) {
    if (Number.isNaN(n)) return "ত্রুটি";
    if (!isFinite(n)) return "ত্রুটি";
    const rounded = Math.round(n * 1e10) / 1e10;
    return String(rounded);
  }

  function inputDigit(d) {
    if (justEvaluated) { display = "0"; justEvaluated = false; }
    if (display === "0" && d !== ".") display = d;
    else if (d === "." && display.includes(".")) return;
    else display += d;
  }

  function inputOp(op) {
    if (pendingOp && !justEvaluated) {
      const result = apply(acc, parseFloat(display), pendingOp);
      acc = result;
      display = formatNum(result);
    } else {
      acc = parseFloat(display);
    }
    pendingOp = op;
    justEvaluated = false;
    display = "0";
    // display keeps 0 until next digit; but we still show acc on screen via getState
  }

  function equals() {
    if (pendingOp == null) return;
    const result = apply(acc, parseFloat(display), pendingOp);
    display = formatNum(result);
    acc = null;
    pendingOp = null;
    justEvaluated = true;
  }

  function clearAll() {
    display = "0"; acc = null; pendingOp = null; justEvaluated = false;
  }

  function backspace() {
    if (justEvaluated) return;
    display = display.length > 1 ? display.slice(0, -1) : "0";
  }

  function toggleSign() {
    if (display === "0") return;
    display = display.startsWith("-") ? display.slice(1) : "-" + display;
  }

  function percent() {
    display = formatNum(parseFloat(display) / 100);
  }

  function getDisplay() {
    return display;
  }

  return { inputDigit, inputOp, equals, clearAll, backspace, toggleSign, percent, getDisplay };
})();

function setupCalculatorDock() {
  const toggle = document.getElementById("calcDockToggle");
  const panel = document.getElementById("calcDockPanel");
  const screen = document.getElementById("calcScreen");
  const focusToggle = document.getElementById("focusDockToggle");
  const focusPanel = document.getElementById("focusDockPanel");

  if (!toggle) return;

  function openCalcPage() {
    panel.classList.add("open"); toggle.classList.add("open");
    if (focusPanel) { focusPanel.classList.remove("open"); focusToggle.classList.remove("open"); }
    document.body.classList.add("tool-page-locked");
  }
  function closeCalcPage() {
    panel.classList.remove("open"); toggle.classList.remove("open");
    if (!focusPanel || !focusPanel.classList.contains("open")) document.body.classList.remove("tool-page-locked");
  }
  toggle.addEventListener("click", () => {
    if (panel.classList.contains("open")) closeCalcPage(); else openCalcPage();
  });
  const backBtn = document.getElementById("calcPageBack");
  if (backBtn) backBtn.addEventListener("click", closeCalcPage);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closeCalcPage();
  });

  function refresh() { screen.textContent = Calc.getDisplay(); }

  document.querySelectorAll("#calcDockPanel [data-digit]").forEach((btn) => {
    btn.addEventListener("click", () => { Calc.inputDigit(btn.dataset.digit); refresh(); });
  });
  document.querySelectorAll("#calcDockPanel [data-op]").forEach((btn) => {
    btn.addEventListener("click", () => { Calc.inputOp(btn.dataset.op); refresh(); });
  });
  document.getElementById("calcEquals").addEventListener("click", () => { Calc.equals(); refresh(); });
  document.getElementById("calcClear").addEventListener("click", () => { Calc.clearAll(); refresh(); });
  document.getElementById("calcBack").addEventListener("click", () => { Calc.backspace(); refresh(); });
  document.getElementById("calcSign").addEventListener("click", () => { Calc.toggleSign(); refresh(); });
  document.getElementById("calcPercent").addEventListener("click", () => { Calc.percent(); refresh(); });
}

window.setupCalculatorDock = setupCalculatorDock;
