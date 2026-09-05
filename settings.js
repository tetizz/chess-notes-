(function () {
  "use strict";

  const STORAGE_KEY = "faithchess_settings";
  const DEFAULTS = Object.freeze({
    darkMode: true,
    boardTheme: "classic",
    pieceSet: "cburnett",
    sound: true,
    legalMoves: true,
    animation: true,
    emailNotif: false,
  });
  const BOARD_THEMES = new Set(["classic", "green", "blue", "purple"]);
  const PIECE_SETS = new Set([
    "alpha", "anarcandy", "caliente", "california", "cardinal", "cburnett", "celtic",
    "chess7", "chessnut", "companion", "cooke", "disguised", "dubrovny", "fantasy",
    "firi", "fresca", "gioco", "governor", "horsey", "icpieces", "kiwen-suwi",
    "kosal", "leipzig", "letter", "maestro", "merida", "monarchy", "mpchess",
    "pirouetti", "pixel", "reillycraig", "rhosgfx", "riohacha", "shahi-ivory-brown",
    "shapes", "spatial", "staunty", "tatiana", "xkcd",
  ]);

  function sanitize(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      darkMode: typeof source.darkMode === "boolean" ? source.darkMode : DEFAULTS.darkMode,
      boardTheme: BOARD_THEMES.has(source.boardTheme) ? source.boardTheme : DEFAULTS.boardTheme,
      pieceSet: PIECE_SETS.has(source.pieceSet) ? source.pieceSet : DEFAULTS.pieceSet,
      sound: typeof source.sound === "boolean" ? source.sound : DEFAULTS.sound,
      legalMoves: typeof source.legalMoves === "boolean" ? source.legalMoves : DEFAULTS.legalMoves,
      animation: typeof source.animation === "boolean" ? source.animation : DEFAULTS.animation,
      emailNotif: typeof source.emailNotif === "boolean" ? source.emailNotif : DEFAULTS.emailNotif,
    };
  }

  function loadSettings() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return sanitize(saved ? JSON.parse(saved) : DEFAULTS);
    } catch (error) {
      console.warn("FaithChess settings were reset because saved data was unreadable.", error);
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    const safeSettings = sanitize(settings);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings));
      return true;
    } catch (error) {
      console.warn("FaithChess settings could not be saved.", error);
      return false;
    }
  }

  function applySettings(settings) {
    document.body.classList.toggle("light-mode", !settings.darkMode);
    document.body.classList.toggle("reduce-app-motion", !settings.animation);
    document.body.dataset.boardTheme = settings.boardTheme;
  }

  const settings = loadSettings();
  applySettings(settings);

  document.addEventListener("DOMContentLoaded", () => {
    const controls = {
      darkMode: document.getElementById("darkModeToggle"),
      boardTheme: document.getElementById("boardTheme"),
      pieceSet: document.getElementById("pieceSet"),
      sound: document.getElementById("soundToggle"),
      legalMoves: document.getElementById("legalMovesToggle"),
      animation: document.getElementById("animationToggle"),
      emailNotif: document.getElementById("emailNotifToggle"),
    };
    const saveBtn = document.getElementById("saveBtn");
    const saveMsg = document.getElementById("saveMsg");

    for (const [key, control] of Object.entries(controls)) {
      if (!control) continue;
      if (control.type === "checkbox") control.checked = settings[key];
      else control.value = settings[key];
    }

    controls.darkMode?.addEventListener("change", () => {
      document.body.classList.toggle("light-mode", !controls.darkMode.checked);
    });

    if (!saveBtn) return;
    saveBtn.addEventListener("click", () => {
      const updated = {
        darkMode: controls.darkMode?.checked ?? DEFAULTS.darkMode,
        boardTheme: controls.boardTheme?.value,
        pieceSet: controls.pieceSet?.value,
        sound: controls.sound?.checked ?? DEFAULTS.sound,
        legalMoves: controls.legalMoves?.checked ?? DEFAULTS.legalMoves,
        animation: controls.animation?.checked ?? DEFAULTS.animation,
        emailNotif: controls.emailNotif?.checked ?? DEFAULTS.emailNotif,
      };
      const saved = saveSettings(updated);
      applySettings(sanitize(updated));
      if (saveMsg) {
        saveMsg.textContent = saved ? "Settings saved." : "Settings applied, but this browser blocked saving.";
        saveMsg.setAttribute("role", "status");
        window.setTimeout(() => { saveMsg.textContent = ""; }, 3000);
      }
    });
  });

  window.getSettings = loadSettings;
  window.getPieceTheme = function getPieceTheme(pieceSet) {
    const safeSet = PIECE_SETS.has(pieceSet) ? pieceSet : DEFAULTS.pieceSet;
    const extension = safeSet === "monarchy" ? "webp" : "svg";
    return `pieces/${safeSet}/{piece}.${extension}`;
  };
})();
