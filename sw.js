/* sw.js — অ্যাপ শেল ক্যাশ করে রাখে যাতে ইন্টারনেট ছাড়াও (হোস্ট করা অবস্থায়) অ্যাপটা চলে।
   ডেটা এমনিতেই IndexedDB-তে লোকালি থাকে, এটা শুধু কোড/অ্যাসেট ফাইলগুলো ক্যাশ করে। */

const CACHE_NAME = "jobprep-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/db.js",
  "./js/i18n.js",
  "./js/tts.js",
  "./js/calculator.js",
  "./js/calendar.js",
  "./js/dictionary-data.js",
  "./js/dictionary.js",
  "./js/app.js",
  "./js/focus.js",
  "./js/routine-generator.js",
  "./vendor/pdfjs/pdf.min.js",
  "./vendor/pdfjs/pdf.worker.min.js",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});
