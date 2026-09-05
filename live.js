(function () {
  "use strict";

  const boardElement = document.getElementById("board");
  const statusElement = document.getElementById("liveStatus");
  const movesElement = document.getElementById("moves");
  let timer = 0;
  let stopped = false;
  let updateInFlight = false;
  let refreshQueued = false;
  let lastGameId = "";
  const activeControllers = new Set();

  function setStatus(message, state = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    if (state) statusElement.dataset.state = state;
    else delete statusElement.dataset.state;
  }

  if (!boardElement || typeof window.Chess !== "function" || typeof window.Chessboard !== "function") {
    setStatus("The live board could not start. Check your connection and reload.", "error");
    return;
  }

  const settings = window.getSettings ? window.getSettings() : {};
  const pieceTheme = window.getPieceTheme
    ? window.getPieceTheme(settings.pieceSet)
    : "pieces/cburnett/{piece}.svg";
  const board = Chessboard("board", {
    position: "start",
    draggable: false,
    moveSpeed: settings.animation === false ? 0 : 180,
    pieceTheme,
  });

  async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    activeControllers.add(controller);
    const timeoutId = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally {
      window.clearTimeout(timeoutId);
      activeControllers.delete(controller);
    }
  }

  function tag(pgn, name, fallback = "") {
    return pgn.match(new RegExp(`^\\[${name} "([^"]*)"\\]`, "m"))?.[1] || fallback;
  }

  function renderPlayer(id, title, name, rating) {
    const bar = document.getElementById(id);
    if (!bar) return;
    bar.replaceChildren();
    const identity = document.createElement("span");
    if (title) {
      const titleElement = document.createElement("span");
      titleElement.className = "title";
      titleElement.textContent = title;
      identity.append(titleElement, document.createTextNode(" "));
    }
    identity.append(document.createTextNode(name));
    const ratingElement = document.createElement("span");
    ratingElement.className = "rating";
    ratingElement.textContent = rating ? `(${rating})` : "";
    bar.append(identity, ratingElement);
  }

  function renderPgn(pgn) {
    const replay = new Chess();
    if (!replay.load_pgn(pgn, { sloppy: true })) throw new Error("Live game PGN was invalid");
    const history = replay.history({ verbose: true });
    board.position(replay.fen(), settings.animation !== false);
    document.querySelectorAll(".highlight-square").forEach(element => {
      element.classList.remove("highlight-square");
    });
    const lastMove = history.at(-1);
    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        document.querySelector(`.square-${square}`)?.classList.add("highlight-square");
      }
    }
    if (movesElement) {
      movesElement.textContent = history.map((move, index) =>
        `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${move.san}`
      ).join(" ");
      movesElement.scrollTop = movesElement.scrollHeight;
    }
    renderPlayer("white-bar", tag(pgn, "WhiteTitle"), tag(pgn, "White", "White"), tag(pgn, "WhiteElo"));
    renderPlayer("black-bar", tag(pgn, "BlackTitle"), tag(pgn, "Black", "Black"), tag(pgn, "BlackElo"));
  }

  async function update() {
    if (stopped) return;
    if (updateInFlight) {
      refreshQueued = true;
      return;
    }
    if (document.hidden) {
      schedule(1500);
      return;
    }
    updateInFlight = true;
    setStatus(lastGameId ? "Refreshing Lichess TV…" : "Connecting to Lichess TV…");
    try {
      const channelsResponse = await fetchWithTimeout("https://lichess.org/api/tv/channels", {
        headers: { Accept: "application/json" },
      });
      const channels = await channelsResponse.json();
      const gameId = channels?.bullet?.gameId;
      if (!gameId) throw new Error("No Bullet TV game is active");
      const pgnResponse = await fetchWithTimeout(
        `https://lichess.org/game/export/${encodeURIComponent(gameId)}?clocks=false&evals=false&literate=false`,
        { headers: { Accept: "application/x-chess-pgn" } },
      );
      renderPgn(await pgnResponse.text());
      lastGameId = gameId;
      setStatus("Lichess Bullet TV · live", "live");
    } catch (error) {
      console.warn("Live board refresh failed.", error);
      setStatus("Live board is temporarily unavailable. Retrying automatically.", "error");
    } finally {
      updateInFlight = false;
      const nextDelay = refreshQueued ? 0 : 7000;
      refreshQueued = false;
      schedule(nextDelay);
    }
  }

  function schedule(delay) {
    window.clearTimeout(timer);
    timer = 0;
    if (stopped) return;
    if (updateInFlight) {
      if (delay === 0) refreshQueued = true;
      return;
    }
    timer = window.setTimeout(() => {
      timer = 0;
      update();
    }, delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(0);
  });
  window.addEventListener("resize", () => board.resize(), { passive: true });
  window.addEventListener("pagehide", () => {
    stopped = true;
    refreshQueued = false;
    window.clearTimeout(timer);
    timer = 0;
    for (const controller of activeControllers) controller.abort();
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    stopped = false;
    board.resize();
    schedule(0);
  });

  update();
})();
