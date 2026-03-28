chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type !== "TRANSLATE") return;

  const { text, provider, mode } = msg;

  if (!text) {
    sendResponse({ original: "", translated: "", meanings: [], examples: [] });
    return;
  }

  // ================= ROUTER =================
  if (provider === "google") {
    handleGoogle(text, sendResponse);
  }

  else if (provider === "dict") {

    // ✅ only use dictionary API for single word
    if (mode === "word") {
      handleDictionary(text, sendResponse);
    } else {
      handleGoogle(text, sendResponse); // fallback
    }
  }

  else if (provider === "ai") {
    handleAI(text, mode, sendResponse);
  }

  return true; // 🔥 keep async alive
});


// ================= GOOGLE =================
function handleGoogle(text, sendResponse) {

  const url =
    `https://clients5.google.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=th&dt=t&dt=bd&dt=ex&q=${encodeURIComponent(text)}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {

      // ✅ TRANSLATION
      let translated = "";
      if (Array.isArray(data[0])) {
        translated = data[0].map(i => i[0]).join("").trim();
      }

      // ✅ MEANINGS
      let meanings = [];

      if (Array.isArray(data[1])) {
        data[1].forEach(entry => {

          const pos = entry[0] || "other";
          const list = entry[1] || [];

          list.forEach(word => {
            if (!word) return;

            meanings.push({
              type: pos,
              meaning: word
            });
          });
        });
      }

      // 🔁 remove duplicates
      meanings = meanings.filter(
        (v, i, arr) =>
          i === arr.findIndex(t => t.meaning === v.meaning && t.type === v.type)
      );

      // ✅ EXAMPLES
      let examples = [];

      if (Array.isArray(data[13])) {
        data[13].forEach(ex => {

          let textEx = "";

          if (typeof ex[0] === "string") {
            textEx = ex[0];
          } else if (Array.isArray(ex[0]) && typeof ex[0][0] === "string") {
            textEx = ex[0][0];
          }

          if (!textEx) return;

          textEx = textEx
            .replace(/<[^>]*>/g, "")
            .replace(/,m_[^ ]+/g, "")
            .trim();

          if (textEx) {
            examples.push(textEx);
          }
        });
      }

      sendResponse({
        original: text,          // 🔥 IMPORTANT FIX
        translated,
        meanings,
        examples
      });

    })
    .catch(err => {

      console.error("❌ Google API error:", err);

      sendResponse({
        original: text,
        translated: "❌ API error",
        meanings: [],
        examples: []
      });
    });
}


// ================= FREE DICTIONARY =================
function handleDictionary(word, sendResponse) {

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error("No result");
      return res.json();
    })
    .then(data => {

      if (!Array.isArray(data)) throw new Error("Invalid format");

      const meanings = [];
      const examples = [];

      data.forEach(entry => {

        entry.meanings?.forEach(m => {

          const type = m.partOfSpeech || "other";

          m.definitions?.forEach(def => {

            if (def.definition) {
              meanings.push({
                type,
                meaning: def.definition
              });
            }

            if (def.example) {
              examples.push(def.example);
            }
          });
        });
      });

      sendResponse({
        original: word,      // 🔥 keep original word
        translated: word,    // dictionary = no translation needed
        meanings: meanings.slice(0, 8),
        examples: examples.slice(0, 3)
      });

    })
    .catch(err => {

      console.error("❌ Dictionary API error:", err);

      sendResponse({
        original: word,
        translated: "No definition found",
        meanings: [],
        examples: []
      });
    });
}


// ================= AI (MOCK) =================
function handleAI(text, mode, sendResponse) {

  if (mode === "word") {
    sendResponse({
      original: text,
      translated: `[AI] ${text}`,
      meanings: [
        { type: "explain", meaning: "AI explanation of this word." }
      ],
      examples: []
    });
  } else {
    sendResponse({
      original: text,
      translated: `[AI] ${text}`,
      meanings: [],
      examples: []
    });
  }
}