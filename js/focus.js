/* focus.js — কনসেন্ট্রেশন সহায়ক: স্টপওয়াচ + ফোকাস (পোমোডোরো-ধাঁচের) টাইমার।
   পুরোপুরি ক্লায়েন্ট-সাইড, কোনো নেটওয়ার্ক লাগে না। */

const Focus = (() => {
  let stopwatchInterval = null;
  let stopwatchStart = 0;
  let stopwatchElapsed = 0;
  let stopwatchRunning = false;

  let focusInterval = null;
  let focusRemaining = 0; // seconds
  let focusTotal = 0;
  let focusRunning = false;
  let focusSectorId = null;
  let focusSubjectId = null;
  let focusTopicId = null;
  let focusMode = "focus"; // 'focus' | 'break'
  let onTickCb = null;
  let onFocusEndCb = null;

  function fmt(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return (h > 0 ? String(h).padStart(2, "0") + ":" : "") +
      String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  // ---- Stopwatch ----
  function startStopwatch(onTick) {
    if (stopwatchRunning) return;
    stopwatchRunning = true;
    stopwatchStart = Date.now() - stopwatchElapsed;
    stopwatchInterval = setInterval(() => {
      stopwatchElapsed = Date.now() - stopwatchStart;
      if (onTick) onTick(fmt(stopwatchElapsed / 1000), stopwatchElapsed);
    }, 250);
  }
  function pauseStopwatch() {
    stopwatchRunning = false;
    clearInterval(stopwatchInterval);
  }
  function resetStopwatch() {
    pauseStopwatch();
    stopwatchElapsed = 0;
  }
  function isStopwatchRunning() {
    return stopwatchRunning;
  }

  // ---- Focus timer (Pomodoro-style, customizable minutes) ----
  function startFocus({ minutes, sectorId, subjectId, topicId, mode = "focus" }, onTick, onEnd) {
    stopFocusInterval();
    focusRemaining = Math.round(minutes * 60);
    focusTotal = focusRemaining;
    focusSectorId = sectorId;
    focusSubjectId = subjectId || null;
    focusTopicId = topicId || null;
    focusMode = mode;
    focusRunning = true;
    onTickCb = onTick;
    onFocusEndCb = onEnd;

    focusInterval = setInterval(() => {
      focusRemaining -= 1;
      if (onTickCb) onTickCb(fmt(focusRemaining), focusRemaining, focusTotal, focusMode);
      if (focusRemaining <= 0) {
        stopFocusInterval();
        focusRunning = false;
        if (focusMode === "focus" && focusSectorId) {
          logFocusSession(focusSectorId, Math.round(focusTotal / 60), focusSubjectId, focusTopicId);
        }
        if (onFocusEndCb) onFocusEndCb(focusMode);
      }
    }, 1000);
  }
  function stopFocusInterval() {
    clearInterval(focusInterval);
  }
  function pauseFocus() {
    focusRunning = false;
    stopFocusInterval();
  }
  function resumeFocus() {
    if (focusRunning || focusRemaining <= 0) return;
    focusRunning = true;
    focusInterval = setInterval(() => {
      focusRemaining -= 1;
      if (onTickCb) onTickCb(fmt(focusRemaining), focusRemaining, focusTotal, focusMode);
      if (focusRemaining <= 0) {
        stopFocusInterval();
        focusRunning = false;
        if (focusMode === "focus" && focusSectorId) {
          logFocusSession(focusSectorId, Math.round(focusTotal / 60), focusSubjectId, focusTopicId);
        }
        if (onFocusEndCb) onFocusEndCb(focusMode);
      }
    }, 1000);
  }
  function cancelFocus() {
    stopFocusInterval();
    focusRunning = false;
    focusRemaining = 0;
  }
  function isFocusRunning() {
    return focusRunning;
  }
  function getSessionInfo() {
    return {
      remaining: focusRemaining,
      total: focusTotal,
      mode: focusMode,
      sectorId: focusSectorId,
      subjectId: focusSubjectId,
      topicId: focusTopicId,
      running: focusRunning,
      active: focusTotal > 0,
    };
  }

  async function logFocusSession(sectorId, minutes, subjectId, topicId) {
    await DB.put(DB.STORES.focusLogs, {
      id: uid(),
      sectorId,
      subjectId: subjectId || null,
      topicId: topicId || null,
      minutes,
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
    });
  }

  return {
    fmt,
    startStopwatch,
    pauseStopwatch,
    resetStopwatch,
    isStopwatchRunning,
    startFocus,
    pauseFocus,
    resumeFocus,
    cancelFocus,
    isFocusRunning,
    getSessionInfo,
  };
})();

window.Focus = Focus;
