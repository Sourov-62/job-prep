/* routine-generator.js
   একটা PDF (বই/সিলেবাস/নোট) থেকে টেক্সট বের করে, তার মধ্যে থাকা
   অধ্যায়/টপিক-এর মতো লাইনগুলো আলাদা করে, এবং সেগুলোকে আজ থেকে
   পরীক্ষার তারিখ (বা ব্যবহারকারীর দেওয়া দিন-সংখ্যা) পর্যন্ত সমান ভাগে
   বিলি করে একটা দিনভিত্তিক রুটিন বানায়। সম্পূর্ণ লোকাল pdf.js দিয়ে
   কাজ করে, কোনো ইন্টারনেট লাগে না।

   ভার্সন ২: শুধু প্লেইন টেক্সটে regex চালানোর বদলে, প্রতিটি টেক্সট আইটেমের
   অবস্থান (x, y) ও ফন্ট সাইজ ব্যবহার করে আসল লাইন পুনর্গঠন করা হয়, এবং
   ফন্ট সাইজ + পুনরাবৃত্ত হেডার/ফুটার বাদ দেওয়ার মতো heuristic যোগ করা হয়েছে —
   যাতে বাস্তব বই/সিলেবাসের পিডিএফ থেকে অনেক বেশি নির্ভরযোগ্যভাবে অধ্যায়/টপিক পাওয়া যায়। */

const RoutineGen = (() => {
  let workerConfigured = false;

  function ensureWorker() {
    if (workerConfigured) return;
    if (window["pdfjsLib"]) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
      workerConfigured = true;
    }
  }

  // pdf.js থেকে প্রতিটি টেক্সট আইটেমের অবস্থান ও ফন্ট সাইজ নিয়ে
  // একই লাইনে থাকা আইটেমগুলোকে (কাছাকাছি y-কোঅর্ডিনেট) একসাথে জোড়া দিয়ে
  // প্রকৃত লাইন পুনর্গঠন করে। প্লেইন concatenated টেক্সটের চেয়ে এটা
  // অনেক বেশি নির্ভরযোগ্য, কারণ pdf.js সবসময় লাইন-ব্রেক দেয় না।
  async function extractLines(arrayBuffer, onProgress) {
    ensureWorker();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const lines = []; // { text, fontSize, page }

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();

      // y-কোঅর্ডিনেট অনুযায়ী গ্রুপ করা (একই লাইনের আইটেম কাছাকাছি y রাখে)
      const buckets = [];
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 10;
        let bucket = buckets.find((b) => Math.abs(b.y - y) <= 3);
        if (!bucket) { bucket = { y, items: [] }; buckets.push(bucket); }
        bucket.items.push({ x: item.transform[4], str: item.str, fontSize });
      }
      // পৃষ্ঠায় উপর থেকে নিচে সাজানো (pdf coordinate y বেশি মানে উপরে)
      buckets.sort((a, b) => b.y - a.y);
      buckets.forEach((b) => {
        b.items.sort((a, c) => a.x - c.x);
        const text = b.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (!text) return;
        const avgFont = b.items.reduce((s, i) => s + i.fontSize, 0) / b.items.length;
        lines.push({ text, fontSize: Math.round(avgFont * 10) / 10, page: p });
      });

      if (onProgress) onProgress(p, pdf.numPages);
    }
    return lines;
  }

  // পুরনো ব্যবহারকারীর জন্য সাধারণ প্লেইন টেক্সট এক্সট্রাকশনও রাখা হলো (fallback/compat)
  async function extractText(arrayBuffer, onProgress) {
    const lines = await extractLines(arrayBuffer, onProgress);
    return lines.map((l) => l.text).join("\n");
  }

  const HEADING_PATTERNS = [
    /^(chapter|unit|part|module|topic|lesson)\s*[:\-]?\s*\d+/i,
    /^অধ্যায়\s*[:\-]?\s*[০-৯0-9]+/,
    /^পর্ব\s*[:\-]?\s*[০-৯0-9]+/,
    /^পাঠ\s*[:\-]?\s*[০-৯0-9]+/,
    /^\d{1,3}[.)]\s*\S+/,
    /^[০-৯]{1,3}[.)]\s*\S+/,
    /^[০-৯]{1,3}[.।]\s*\S+/,
  ];

  const NOISE_PATTERNS = [
    /^page\s*\d+/i,
    /^পৃষ্ঠা\s*[০-৯0-9]+/,
    /^\d+\s*$/,
    /^[০-৯]+\s*$/,
    /^www\.|http/i,
    /^©|all rights reserved/i,
  ];

  function isNoise(text) {
    return NOISE_PATTERNS.some((p) => p.test(text));
  }

  // লাইনগুলো থেকে অধ্যায়/টপিক শনাক্ত করা:
  // ১) numbering প্যাটার্ন মিললে সরাসরি হেডিং ধরা হয়
  // ২) নাহলে ফন্ট সাইজ শরীরের (body) মিডিয়ান ফন্ট সাইজের চেয়ে যথেষ্ট বড় হলে হেডিং ধরা হয়
  // ৩) প্রতিটি পৃষ্ঠায় বারবার হুবহু একই লাইন (হেডার/ফুটার) থাকলে বাদ দেওয়া হয়
  function extractTopics(input) {
    const lines = Array.isArray(input)
      ? input
      : String(input).split("\n").map((t) => ({ text: t.trim(), fontSize: 10, page: 0 })).filter((l) => l.text);

    if (lines.length === 0) return [];

    // পুনরাবৃত্ত হেডার/ফুটার শনাক্তকরণ: একই টেক্সট অনেক পৃষ্ঠায় থাকলে বাদ
    const pagesSeenByText = {};
    lines.forEach((l) => {
      const key = l.text.toLowerCase();
      pagesSeenByText[key] = pagesSeenByText[key] || new Set();
      pagesSeenByText[key].add(l.page);
    });
    const totalPages = Math.max(1, new Set(lines.map((l) => l.page)).size);
    const repeatedTexts = new Set(
      Object.keys(pagesSeenByText).filter((k) => pagesSeenByText[k].size >= Math.max(3, totalPages * 0.4))
    );

    const cleanLines = lines.filter((l) => {
      if (l.text.length < 3 || l.text.length > 110) return false;
      if (isNoise(l.text)) return false;
      if (repeatedTexts.has(l.text.toLowerCase())) return false;
      return true;
    });

    if (cleanLines.length === 0) return [];

    const fontSizes = cleanLines.map((l) => l.fontSize).sort((a, b) => a - b);
    const medianFont = fontSizes[Math.floor(fontSizes.length / 2)] || 10;
    const headingFontThreshold = medianFont * 1.12;

    const seen = new Set();
    let topics = [];

    cleanLines.forEach((l) => {
      const matchesPattern = HEADING_PATTERNS.some((p) => p.test(l.text));
      const isBigFont = l.fontSize >= headingFontThreshold && l.fontSize > medianFont + 0.4;
      // খুব লম্বা লাইন (পূর্ণ বাক্য/অনুচ্ছেদ) সাধারণত হেডিং না, বড় ফন্ট হলেও বাদ
      const looksLikeSentence = /[।.!?]\s*\S+\s+\S+\s+\S+/.test(l.text) && l.text.length > 70;

      if ((matchesPattern || isBigFont) && !looksLikeSentence) {
        const key = l.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          topics.push(l.text.replace(/\s+/g, " ").trim());
        }
      }
    });

    // হেডিং প্যাটার্ন/বড় ফন্ট থেকে খুব কম টপিক পাওয়া গেলে (স্ক্যান করা/অগোছালো PDF),
    // ফলব্যাক হিসেবে অনুচ্ছেদ-ভিত্তিক ভাগ করে দাও যাতে রুটিন খালি না থাকে।
    if (topics.length < 3) {
      const paras = cleanLines
        .map((l) => l.text)
        .filter((p) => p.length > 20);
      const merged = [];
      for (let i = 0; i < paras.length; i += 3) {
        merged.push(paras.slice(i, i + 3).join(" "));
      }
      topics = merged
        .slice(0, 80)
        .map((p, idx) => `অংশ ${idx + 1}: ${p.slice(0, 70)}${p.length > 70 ? "…" : ""}`);
    }

    return topics;
  }

  // topics কে startDate থেকে endDate পর্যন্ত সমান ভাগে বিলি করে routine আইটেম বানায়।
  function buildSchedule({ topics, sectorId, sourceTitle, startDate, endDate, perDayCount, subjectId, topicId }) {
    const items = [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    let dayCount;
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      dayCount = Math.max(1, Math.round((end - start) / 86400000) + 1);
    } else {
      dayCount = Math.max(1, Math.ceil(topics.length / (perDayCount || 3)));
    }

    const perDay = perDayCount || Math.max(1, Math.ceil(topics.length / dayCount));

    let topicIdx = 0;
    for (let d = 0; d < dayCount && topicIdx < topics.length; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      const dateStr = date.toISOString().slice(0, 10);

      for (let k = 0; k < perDay && topicIdx < topics.length; k++) {
        items.push({
          id: uid(),
          sectorId,
          date: dateStr,
          topic: topics[topicIdx],
          source: sourceTitle,
          done: false,
          subjectId: subjectId || null,
          topicId: topicId || null,
          createdAt: Date.now(),
        });
        topicIdx++;
      }
    }

    if (topicIdx < topics.length) {
      const lastDate = items.length ? items[items.length - 1].date : start.toISOString().slice(0, 10);
      while (topicIdx < topics.length) {
        items.push({
          id: uid(),
          sectorId,
          date: lastDate,
          topic: topics[topicIdx],
          source: sourceTitle,
          done: false,
          subjectId: subjectId || null,
          topicId: topicId || null,
          createdAt: Date.now(),
        });
        topicIdx++;
      }
    }

    return items;
  }

  return { extractText, extractLines, extractTopics, buildSchedule };
})();

window.RoutineGen = RoutineGen;
