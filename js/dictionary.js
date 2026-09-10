/* dictionary.js — বিল্ট-ইন শব্দভান্ডার + ব্যবহারকারীর নিজের যোগ করা শব্দ একসাথে খোঁজে।
   প্রতিটি ফলাফলে থাকে: word, pos, bnMeaning, enMeaning, synonyms, example */

const Dictionary = (() => {
  function searchBuiltin(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return BUILTIN_DICTIONARY
      .filter(([word]) => word.toLowerCase().includes(q))
      .map(([word, pos, bnMeaning, enMeaning, synonyms, example]) => ({
        word, pos, bnMeaning, enMeaning, synonyms, example, custom: false,
      }))
      .sort((a, b) => {
        // exact/startsWith matches আগে দেখাও
        const aStarts = a.word.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.word.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.word.length - b.word.length;
      });
  }

  async function searchCustom(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await DB.all(DB.STORES.customDict);
    return all
      .filter((e) => e.word.toLowerCase().includes(q))
      .map((e) => ({
        word: e.word,
        pos: e.pos || "",
        bnMeaning: e.bnMeaning || "",
        enMeaning: e.enMeaning || "",
        synonyms: e.synonyms || "",
        example: e.example || "",
        custom: true,
        id: e.id,
      }));
  }

  async function search(query) {
    const [builtin, custom] = await Promise.all([
      Promise.resolve(searchBuiltin(query)),
      searchCustom(query),
    ]);
    return [...custom, ...builtin].slice(0, 40);
  }

  async function addCustom({ word, pos, bnMeaning, enMeaning, synonyms, example }) {
    return DB.put(DB.STORES.customDict, {
      id: uid(),
      word: word.trim(),
      pos: (pos || "").trim(),
      bnMeaning: (bnMeaning || "").trim(),
      enMeaning: (enMeaning || "").trim(),
      synonyms: (synonyms || "").trim(),
      example: (example || "").trim(),
      createdAt: Date.now(),
    });
  }

  async function deleteCustom(id) {
    return DB.delete(DB.STORES.customDict, id);
  }

  async function listCustom() {
    const all = await DB.all(DB.STORES.customDict);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  return { search, addCustom, deleteCustom, listCustom };
})();

window.Dictionary = Dictionary;
