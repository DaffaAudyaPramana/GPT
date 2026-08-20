(() => {
  "use strict";

  const SCRIPT_VERSION = "2.0.0";
  const STYLE_ID = "cgb-dynamic-style";
  const OWNED_SELECTOR = "[data-cgb-owned]";

  const DEFAULTS = {
    enabled: true,
    messagesToShow: 10,
    loadBatchSize: 10,
    showToast: true
  };

  let settings = { ...DEFAULTS };
  // visibleCount: jumlah pesan yang ditampilkan saat ini (bisa bertambah saat klik "muat")
  let visibleCount = DEFAULTS.messagesToShow;
  let totalTurns = 0;
  let observer = null;
  let applyTimer = null;
  let applying = false;
  let currentConversation = "";
  let placeholder = null;
  let placeholderButton = null;
  let placeholderTitle = null;
  let placeholderHint = null;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function clampInteger(value, fallback, min, max) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function normalizeSettings(raw) {
    return {
      enabled: raw.enabled !== false,
      messagesToShow: clampInteger(raw.messagesToShow, DEFAULTS.messagesToShow, 1, 500),
      loadBatchSize: clampInteger(raw.loadBatchSize, DEFAULTS.loadBatchSize, 1, 500),
      showToast: raw.showToast !== false
    };
  }

  function getConversationKey() {
    return location.pathname;
  }

  // ─── Turn Detection ──────────────────────────────────────────────────────────

  /**
   * Cari semua "turn" percakapan di halaman.
   * ChatGPT menggunakan beberapa struktur DOM yang berbeda tergantung versi.
   */
  function findTurns() {
    const main = document.querySelector("main");
    if (!main) return [];

    // Strategi 1: data-testid="conversation-turn-N"
    let turns = [...main.querySelectorAll('[data-testid^="conversation-turn-"]')];
    if (turns.length > 0) return turns;

    // Strategi 2: article dengan data-message-author-role di dalamnya
    turns = [...main.querySelectorAll("article")].filter(
      a => a.querySelector("[data-message-author-role]")
    );
    if (turns.length > 0) return turns;

    // Strategi 3: elemen dengan data-message-author-role
    turns = [...main.querySelectorAll("[data-message-author-role]")].map(
      node => node.closest("article") || node.closest("[data-message-id]") || node.parentElement
    );
    // de-duplicate
    turns = [...new Set(turns)].filter(Boolean);
    if (turns.length > 0) return turns;

    // Strategi 4: semua article
    turns = [...main.querySelectorAll("article")];
    if (turns.length > 0) return turns;

    // Strategi 5: data-message-id
    turns = [...main.querySelectorAll("[data-message-id]")];
    return turns;
  }

  // ─── Placeholder "Muat Sebelumnya" ──────────────────────────────────────────

  function ensurePlaceholder() {
    if (placeholder && placeholder.isConnected) return placeholder;

    placeholder = document.createElement("div");
    placeholder.className = "cgb-load-more";
    placeholder.dataset.cgbOwned = "true";

    placeholderButton = document.createElement("button");
    placeholderButton.type = "button";
    placeholderButton.className = "cgb-load-more__button";

    placeholderTitle = document.createElement("span");
    placeholderTitle.className = "cgb-load-more__title";
    placeholderHint = document.createElement("span");
    placeholderHint.className = "cgb-load-more__hint";

    placeholderButton.append(placeholderTitle, placeholderHint);
    placeholderButton.addEventListener("click", () => {
      visibleCount = Math.min(totalTurns, visibleCount + settings.loadBatchSize);
      applyBooster("load-previous");
    });
    placeholder.append(placeholderButton);
    return placeholder;
  }

  function removePlaceholder() {
    placeholder?.remove();
  }

  function updatePlaceholder(turns, hiddenCount) {
    if (hiddenCount <= 0) {
      removePlaceholder();
      return;
    }

    const firstVisible = turns[hiddenCount];
    if (!firstVisible?.parentNode) {
      removePlaceholder();
      return;
    }

    const node = ensurePlaceholder();
    const amount = Math.min(settings.loadBatchSize, hiddenCount);
    const titleText = `⬆ Muat ${amount} pesan sebelumnya`;
    const hintText = `${hiddenCount} pesan lama disembunyikan`;

    if (placeholderTitle.textContent !== titleText) placeholderTitle.textContent = titleText;
    if (placeholderHint.textContent !== hintText) placeholderHint.textContent = hintText;

    if (node.parentNode !== firstVisible.parentNode || node.nextSibling !== firstVisible) {
      firstVisible.parentNode.insertBefore(node, firstVisible);
    }
  }

  // ─── Core Apply ─────────────────────────────────────────────────────────────

  function applyBooster(reason) {
    if (applying) return;
    applying = true;
    observer?.disconnect();

    try {
      const convKey = getConversationKey();
      if (convKey !== currentConversation) {
        currentConversation = convKey;
        // Percakapan baru → reset ke limit dari settings
        visibleCount = settings.messagesToShow;
      }

      const turns = findTurns();
      totalTurns = turns.length;

      if (!turns.length) {
        removePlaceholder();
        reconnectObserver();
        return;
      }

      if (!settings.enabled) {
        // Semua ditampilkan
        turns.forEach(t => {
          t.style.removeProperty("display");
          t.removeAttribute("data-cgb-hidden");
        });
        removePlaceholder();
        sendStats(turns.length, turns.length, 0);
        reconnectObserver();
        return;
      }

      const limit = visibleCount;
      const hiddenCount = Math.max(0, turns.length - limit);

      turns.forEach((turn, i) => {
        const shouldHide = i < hiddenCount;
        if (shouldHide) {
          if (turn.style.display !== "none") turn.style.setProperty("display", "none", "important");
          if (!turn.hasAttribute("data-cgb-hidden")) turn.setAttribute("data-cgb-hidden", "true");
        } else {
          if (turn.style.display === "none") turn.style.removeProperty("display");
          if (turn.hasAttribute("data-cgb-hidden")) turn.removeAttribute("data-cgb-hidden");
        }
      });

      updatePlaceholder(turns, hiddenCount);
      sendStats(turns.length, turns.length - hiddenCount, hiddenCount);
    } finally {
      applying = false;
      reconnectObserver();
    }
  }

  function sendStats(total, visible, hidden) {
    // Kirim ke popup jika ada listener
    try {
      chrome.runtime.sendMessage({
        type: "CGB_STATS_UPDATE",
        stats: {
          total,
          visible,
          hidden,
          percentReduced: total ? Math.round((hidden / total) * 100) : 0,
          enabled: settings.enabled,
          version: SCRIPT_VERSION
        }
      }).catch(() => {});
    } catch (_) {}
  }

  function scheduleApply(reason, delay = 200) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => applyBooster(reason), delay);
  }

  // ─── Observer ────────────────────────────────────────────────────────────────

  function reconnectObserver() {
    if (!observer) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function mutationIsRelevant(mutations) {
    for (const m of mutations) {
      if (m.target instanceof Element && m.target.closest(OWNED_SELECTOR)) continue;
      const nodes = [...m.addedNodes, ...m.removedNodes];
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (node.closest(OWNED_SELECTOR)) continue;
        if (
          node.matches('main, article, [data-message-author-role], [data-testid], [data-message-id]') ||
          node.querySelector('article, [data-message-author-role], [data-testid], [data-message-id]') ||
          node.closest("main")
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // ─── SPA Navigation ─────────────────────────────────────────────────────────

  function patchHistory() {
    const wrap = (original) => function (...args) {
      const result = original.apply(this, args);
      scheduleApply("history", 300);
      return result;
    };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener("popstate", () => scheduleApply("popstate", 300));
  }

  // ─── Toast ──────────────────────────────────────────────────────────────────

  function showToast(msg) {
    if (!settings.showToast) return;
    if (!document.body) return;
    document.querySelectorAll(".cgb-toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = "cgb-toast";
    toast.dataset.cgbOwned = "true";
    toast.textContent = msg || "Conversation Booster aktif";
    document.body.append(toast);

    setTimeout(() => {
      toast.classList.add("cgb-toast--hide");
      setTimeout(() => toast.remove(), 350);
    }, 2000);
  }

  // ─── Message Handlers ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;

    if (message.type === "CGB_GET_STATS") {
      const turns = findTurns();
      const total = turns.length;
      const limit = visibleCount;
      const hidden = Math.max(0, total - limit);
      sendResponse({
        total,
        visible: total - hidden,
        hidden,
        percentReduced: total ? Math.round((hidden / total) * 100) : 0,
        enabled: settings.enabled,
        messagesToShow: settings.messagesToShow,
        version: SCRIPT_VERSION
      });
      return true;
    }

    if (message.type === "CGB_APPLY_SETTINGS") {
      settings = normalizeSettings({ ...DEFAULTS, ...message.settings });
      // KRITIS: reset visibleCount agar limit baru langsung berlaku
      visibleCount = settings.messagesToShow;
      applyBooster("settings-applied");
      const turns = findTurns();
      const total = turns.length;
      const hidden = Math.max(0, total - visibleCount);
      sendResponse({
        ok: true,
        total,
        visible: total - hidden,
        hidden,
        percentReduced: total ? Math.round((hidden / total) * 100) : 0,
        enabled: settings.enabled,
        version: SCRIPT_VERSION
      });
      return true;
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────────────

  function initialize() {
    observer = new MutationObserver((mutations) => {
      if (!applying && mutationIsRelevant(mutations)) {
        scheduleApply("mutation", 200);
      }
    });

    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = normalizeSettings({ ...DEFAULTS, ...stored });
      visibleCount = settings.messagesToShow;
      currentConversation = getConversationKey();

      // Terapkan segera, lalu sekali lagi setelah DOM mungkin selesai render
      applyBooster("initial");
      setTimeout(() => applyBooster("initial-delayed"), 800);
      setTimeout(() => applyBooster("initial-delayed-2"), 2000);

      showToast();
      patchHistory();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleApply("tab-visible", 300);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
