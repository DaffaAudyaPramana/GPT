(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    messagesToShow: 10,
    loadBatchSize: 10,
    showToast: true
  };

  // ─── Elemen DOM ───────────────────────────────────────────────────────────────
  const elEnabled      = document.getElementById("enabled");
  const elMessages     = document.getElementById("messagesToShow");
  const elBatch        = document.getElementById("loadBatchSize");
  const elToast        = document.getElementById("showToast");
  const elReducedStat  = document.getElementById("reducedStat");
  const elRenderedStat = document.getElementById("renderedStat");
  const elStatus       = document.getElementById("pageStatus");
  const elSaveBtn      = document.getElementById("saveBtn");

  // Stepper buttons
  document.getElementById("msgDecBtn").addEventListener("click",   () => step(elMessages, -1));
  document.getElementById("msgIncBtn").addEventListener("click",   () => step(elMessages, +1));
  document.getElementById("batchDecBtn").addEventListener("click", () => step(elBatch, -1));
  document.getElementById("batchIncBtn").addEventListener("click", () => step(elBatch, +1));

  function step(input, delta) {
    const val = clamp(Number(input.value) + delta, 1, 500);
    input.value = val;
  }

  function clamp(v, min, max) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULTS.messagesToShow;
  }

  function readControls() {
    return {
      enabled:        elEnabled.checked,
      messagesToShow: clamp(elMessages.value, 1, 500),
      loadBatchSize:  clamp(elBatch.value, 1, 500),
      showToast:      elToast.checked
    };
  }

  function fillControls(s) {
    elEnabled.checked = s.enabled !== false;
    elMessages.value  = clamp(s.messagesToShow, 1, 500);
    elBatch.value     = clamp(s.loadBatchSize, 1, 500);
    elToast.checked   = s.showToast !== false;
  }

  function updateStats(stats) {
    if (!stats || typeof stats.total === "undefined") {
      elReducedStat.textContent  = "—";
      elRenderedStat.textContent = "—";
      setStatus("Buka chatgpt.com untuk melihat status.", "error");
      return;
    }

    const pct = stats.total ? `${stats.percentReduced}%` : "0%";
    elReducedStat.textContent  = pct;
    elRenderedStat.textContent = `${stats.visible} / ${stats.total}`;

    if (!stats.total) {
      setStatus("Belum ada percakapan di halaman ini.", "warning");
    } else if (!stats.enabled) {
      setStatus(`Booster nonaktif — ${stats.total} pesan tampil semua.`, "");
    } else if (stats.hidden > 0) {
      setStatus(`${stats.hidden} pesan disembunyikan. ${stats.visible} pesan tampil.`, "ok");
    } else {
      setStatus("Booster aktif — semua pesan sudah tampil (belum perlu disembunyikan).", "ok");
    }
  }

  function setStatus(msg, type) {
    elStatus.textContent = msg;
    elStatus.className = "page-status" + (type === "error" ? " page-status--error"
      : type === "warning" ? " page-status--warning"
      : type === "ok" ? " page-status--ok"
      : "");
  }

  // ─── Komunikasi dengan tab ────────────────────────────────────────────────────

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function refreshStats() {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) { setStatus("Buka chatgpt.com untuk mulai.", "warning"); return; }
      const stats = await chrome.tabs.sendMessage(tab.id, { type: "CGB_GET_STATS" });
      updateStats(stats);
    } catch (_) {
      elReducedStat.textContent  = "—";
      elRenderedStat.textContent = "—";
      setStatus("Buka chatgpt.com untuk melihat status.", "error");
    }
  }

  // ─── Simpan & Reload ──────────────────────────────────────────────────────────

  elSaveBtn.addEventListener("click", async () => {
    elSaveBtn.disabled = true;
    elSaveBtn.textContent = "⏳ Menyimpan...";

    const settings = readControls();

    // Tampilkan nilai terkoreksi
    elMessages.value = settings.messagesToShow;
    elBatch.value    = settings.loadBatchSize;

    // Simpan ke storage
    await chrome.storage.sync.set(settings);

    // Kirim ke content script dan reload halaman agar perubahan langsung berlaku
    try {
      const tab = await getActiveTab();
      if (tab?.id && tab.url && (tab.url.includes("chatgpt.com") || tab.url.includes("chat.openai.com"))) {
        // Coba kirim ke content script dulu
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "CGB_APPLY_SETTINGS", settings });
        } catch (_) {}

        // Reload halaman agar benar-benar bersih
        await chrome.tabs.reload(tab.id);

        elSaveBtn.textContent = "✅ Disimpan! Halaman di-reload...";
        setTimeout(() => {
          elSaveBtn.textContent = "💾 Simpan & Terapkan";
          elSaveBtn.disabled = false;
          refreshStats();
        }, 2500);
        return;
      }
    } catch (_) {}

    elSaveBtn.textContent = "✅ Tersimpan";
    setTimeout(() => {
      elSaveBtn.textContent = "💾 Simpan & Terapkan";
      elSaveBtn.disabled = false;
    }, 1500);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    fillControls({ ...DEFAULTS, ...stored });
    refreshStats();
  });
})();
