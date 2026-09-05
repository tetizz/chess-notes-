(function () {
  "use strict";

  const boardIds = ["board1", "board2", "board3", "board4"];
  const statusElement = document.getElementById("watchStatus");
  const settings = window.getSettings ? window.getSettings() : {};
  const pieceTheme = window.getPieceTheme
    ? window.getPieceTheme(settings.pieceSet)
    : "pieces/cburnett/{piece}.svg";
  const boardLibrariesReady = typeof window.Chess === "function" && typeof window.Chessboard === "function";
  const instances = boardLibrariesReady ? boardIds
    .filter(id => document.getElementById(id))
    .map(id => ({
      id,
      gameId: null,
      board: Chessboard(id, {
        position: "start",
        draggable: false,
        moveSpeed: settings.animation === false ? 0 : 140,
        pieceTheme,
      }),
    })) : [];

  let timer = 0;
  let stopped = false;
  let updateInFlight = false;
  let refreshQueued = false;
  const activeControllers = new Set();

  function setStatus(message, state = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    if (state) statusElement.dataset.state = state;
    else delete statusElement.dataset.state;
  }

  if (!boardLibrariesReady || !instances.length) {
    setStatus("The live boards could not start. Check your connection and reload.", "error");
    return;
  }

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

  function readTag(pgn, name, fallback = "") {
    const match = pgn.match(new RegExp(`^\\[${name} "([^"]*)"\\]`, "m"));
    return match?.[1] || fallback;
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

  function renderGame(instance, gameId, pgn) {
    const replay = new Chess();
    if (!replay.load_pgn(pgn, { sloppy: true })) throw new Error("Invalid game PGN");
    const history = replay.history({ verbose: true });
    instance.board.position(replay.fen(), settings.animation !== false);
    document.querySelectorAll(`#${instance.id} .highlight-square`).forEach(element => {
      element.classList.remove("highlight-square");
    });
    const lastMove = history.at(-1);
    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        document.querySelector(`#${instance.id} .square-${square}`)?.classList.add("highlight-square");
      }
    }
    renderPlayer(`${instance.id}-white`, readTag(pgn, "WhiteTitle"), readTag(pgn, "White", "White"), readTag(pgn, "WhiteElo"));
    renderPlayer(`${instance.id}-black`, readTag(pgn, "BlackTitle"), readTag(pgn, "Black", "Black"), readTag(pgn, "BlackElo"));
    instance.gameId = gameId;
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
    setStatus("Refreshing four live boards…");
    try {
      const channelsResponse = await fetchWithTimeout("https://lichess.org/api/tv/channels", {
        headers: { Accept: "application/json" },
      });
      const channels = await channelsResponse.json();
      const ids = [
        channels?.bullet?.gameId,
        channels?.blitz?.gameId,
        channels?.rapid?.gameId,
        channels?.classical?.gameId,
      ];
      const requests = ids.map(gameId => gameId
        ? fetchWithTimeout(
          `https://lichess.org/game/export/${encodeURIComponent(gameId)}?clocks=false&evals=false&literate=false`,
          { headers: { Accept: "application/x-chess-pgn" } },
        ).then(response => response.text())
        : Promise.reject(new Error("No active game")),
      );
      const results = await Promise.allSettled(requests);
      let updated = 0;
      results.forEach((result, index) => {
        if (result.status !== "fulfilled" || !instances[index] || !ids[index]) return;
        try {
          renderGame(instances[index], ids[index], result.value);
          updated += 1;
        } catch (error) {
          console.warn(`Board ${index + 1} could not be rendered.`, error);
        }
      });
      if (!updated) throw new Error("No live board could be updated");
      setStatus(updated === instances.length
        ? "All four Lichess TV boards are live."
        : `${updated} of ${instances.length} live boards updated; retrying the others.`,
      updated === instances.length ? "live" : "");
    } catch (error) {
      console.warn("Live board wall refresh failed.", error);
      setStatus("Live games are temporarily unavailable. Retrying automatically.", "error");
    } finally {
      updateInFlight = false;
      const nextDelay = refreshQueued ? 0 : 8000;
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
  window.addEventListener("resize", () => {
    for (const instance of instances) instance.board.resize();
  }, { passive: true });
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
    for (const instance of instances) instance.board.resize();
    schedule(0);
  });

  update();
})();
