(function () {
  "use strict";

  const statusEl = document.getElementById("puzzleStatus");
  const boardWrapper = document.querySelector(".board-wrapper");
  const popup = document.getElementById("puzzle-popup");
  const popupBox = popup?.querySelector(".popup-box");
  const titleEl = document.getElementById("puzzle-title");
  const descriptionEl = document.getElementById("puzzle-desc");
  const retryBtn = document.getElementById("retryBtn");
  const nextBtn = document.getElementById("exitBtn");
  const solutionBtn = document.getElementById("viewSolutionBtn");
  const moveForm = document.getElementById("puzzleMoveForm");
  const moveInput = document.getElementById("puzzleMove");
  const nextPuzzleBtn = document.getElementById("nextPuzzleBtn");

  function setStatus(message, state = "") {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (state) statusEl.dataset.state = state;
    else delete statusEl.dataset.state;
  }

  if (typeof window.Chess !== "function" || typeof window.Chessboard !== "function") {
    setStatus("The board library did not load. Check your connection, then reload this page.", "error");
    boardWrapper?.setAttribute("aria-busy", "false");
    return;
  }

  const settings = window.getSettings ? window.getSettings() : {};
  const pieceSet = settings.pieceSet || "cburnett";
  const pieceTheme = window.getPieceTheme
    ? window.getPieceTheme(pieceSet)
    : "pieces/cburnett/{piece}.svg";
  const animationTime = settings.animation === false ? 0 : 180;
  const game = new Chess();
  const soundPaths = {
    move: "sounds/move-self.mp3",
    capture: "sounds/capture.mp3",
    check: "sounds/move-check.mp3",
    correct: "sounds/shoutout.mp3",
    incorrect: "sounds/puzzle-wrong.mp3",
  };
  const audioCache = new Map();

  let board;
  let puzzle = null;
  let step = 0;
  let streak = readStreak();
  let inputLocked = true;
  let loading = false;
  let puzzlePool = [];
  let solutionPlaying = false;
  let playerColor = "white";
  let sequenceId = 0;
  let lastFocused = null;

  function readStreak() {
    try {
      const value = Number.parseInt(sessionStorage.getItem("faithchess_puzzle_streak"), 10);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function saveStreak() {
    try {
      sessionStorage.setItem("faithchess_puzzle_streak", String(streak));
    } catch {
      // A blocked storage API should never stop the trainer.
    }
  }

  function playSound(name) {
    const currentSettings = window.getSettings ? window.getSettings() : settings;
    if (!currentSettings.sound || !soundPaths[name]) return;
    let audio = audioCache.get(name);
    if (!audio) {
      audio = new Audio(soundPaths[name]);
      audio.preload = "none";
      audioCache.set(name, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  board = Chessboard("board", {
    draggable: true,
    moveSpeed: animationTime,
    snapSpeed: animationTime,
    snapbackSpeed: animationTime,
    position: "start",
    pieceTheme,
    onDrop,
    onDragStart,
    onSnapbackEnd: clearLegalDots,
  });

  function updateUI() {
    const side = document.getElementById("sideToMove");
    const rating = document.getElementById("puzzleRating");
    const streakEl = document.getElementById("streakCount");
    if (side) side.textContent = puzzle ? (playerColor === "white" ? "White" : "Black") : "—";
    if (rating) rating.textContent = puzzle?.rating ?? "—";
    if (streakEl) streakEl.textContent = String(streak);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function isValidPuzzle(candidate) {
    if (!candidate || typeof candidate.fen !== "string" || !Array.isArray(candidate.solution)) return false;
    if (candidate.solution.length < 2) return false;
    const validator = new Chess(candidate.fen);
    if (!validator.load(candidate.fen)) return false;
    for (const uci of candidate.solution) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return false;
      const move = validator.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || "q",
      });
      if (!move) return false;
    }
    return true;
  }

  async function refillPool() {
    const response = await fetch("puzzles-sample.json", { cache: "force-cache" });
    if (!response.ok) throw new Error(`Puzzle pack returned HTTP ${response.status}`);
    const candidates = await response.json();
    if (!Array.isArray(candidates)) throw new Error("Puzzle pack format is invalid");
    const valid = candidates.filter(isValidPuzzle);
    if (!valid.length) throw new Error("Puzzle pack contains no legal puzzles");
    puzzlePool = shuffle(valid);
  }

  async function fetchPuzzle() {
    if (!puzzlePool.length) await refillPool();
    return puzzlePool.pop() || null;
  }

  function clearHighlights() {
    document.querySelectorAll(".highlight-green, .highlight-red, .highlight-blue").forEach(element => {
      element.classList.remove("highlight-green", "highlight-red", "highlight-blue");
    });
  }

  function highlightSquare(square, type) {
    const element = document.querySelector(`.square-${square}`);
    element?.classList.add(`highlight-${type}`);
  }

  function clearLegalDots() {
    document.querySelectorAll(".legal-dot, .legal-dot-capture").forEach(element => {
      element.classList.remove("legal-dot", "legal-dot-capture");
    });
  }

  function buildSolutionNotation(startFen, moves) {
    const replay = new Chess(startFen);
    return moves.map(uci => replay.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
    })?.san || uci);
  }

  function hideDialog({ restoreFocus = true } = {}) {
    if (!popup) return;
    popup.hidden = true;
    popup.classList.add("hidden");
    if (restoreFocus && lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function showDialog(title, description) {
    if (!popup) return;
    lastFocused = document.activeElement;
    if (titleEl) titleEl.textContent = title;
    if (descriptionEl) descriptionEl.textContent = description;
    popup.hidden = false;
    popup.classList.remove("hidden");
    window.requestAnimationFrame(() => retryBtn?.focus());
  }

  function resetCurrentPuzzle() {
    if (!puzzle) return;
    sequenceId += 1;
    const token = sequenceId;
    hideDialog({ restoreFocus: false });
    solutionPlaying = false;
    inputLocked = true;
    step = 0;
    game.load(puzzle.fen);
    board.position(puzzle.fen, false);
    clearHighlights();
    clearLegalDots();
    updateUI();
    setStatus("Watch the reply, then find the best move.");
    window.setTimeout(() => runAutoSequence(token), animationTime ? 220 : 0);
  }

  function playSolution() {
    if (!puzzle || solutionPlaying) return;
    sequenceId += 1;
    const token = sequenceId;
    solutionPlaying = true;
    inputLocked = true;
    hideDialog({ restoreFocus: false });
    game.load(puzzle.fen);
    board.position(puzzle.fen, false);
    clearHighlights();

    const solution = buildSolutionNotation(puzzle.fen, puzzle.solution);
    const solutionEl = document.getElementById("solutionMoves");
    if (solutionEl) {
      solutionEl.textContent = solution.join(" ");
      solutionEl.closest(".panel-row")?.classList.remove("hidden");
    }
    setStatus("Playing the full solution…");

    let index = 0;
    function playNext() {
      if (token !== sequenceId) return;
      if (index >= puzzle.solution.length) {
        solutionPlaying = false;
        setStatus("Solution complete. Retry it from memory or choose another puzzle.", "ready");
        showDialog("Solution complete", "Try the same position from memory, or continue to another puzzle.");
        return;
      }
      const uci = puzzle.solution[index];
      const move = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || "q",
      });
      if (!move) {
        solutionPlaying = false;
        setStatus("This puzzle could not be replayed. Choose the next one.", "error");
        return;
      }
      board.position(game.fen(), animationTime > 0);
      clearHighlights();
      const color = index % 2 === 0 ? "blue" : "green";
      highlightSquare(uci.slice(0, 2), color);
      highlightSquare(uci.slice(2, 4), color);
      playSound(move.captured ? "capture" : "move");
      index += 1;
      window.setTimeout(playNext, animationTime ? 650 : 0);
    }
    playNext();
  }

  function onDragStart(_source, piece) {
    if (inputLocked || !puzzle) return false;
    const correctColor = (game.turn() === "w" && piece.startsWith("w"))
      || (game.turn() === "b" && piece.startsWith("b"));
    if (!correctColor) return false;

    const currentSettings = window.getSettings ? window.getSettings() : settings;
    if (currentSettings.legalMoves) {
      clearLegalDots();
      game.moves({ square: _source, verbose: true }).forEach(move => {
        const target = document.querySelector(`.square-${move.to}`);
        target?.classList.add(move.captured ? "legal-dot-capture" : "legal-dot");
      });
    }
    return true;
  }

  function runAutoSequence(token = sequenceId) {
    if (token !== sequenceId || !puzzle || step >= puzzle.solution.length) return;
    const uci = puzzle.solution[step];
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
    });
    if (!move) {
      inputLocked = true;
      setStatus("This puzzle is invalid. Choose the next one.", "error");
      return;
    }
    board.position(game.fen(), animationTime > 0);
    clearHighlights();
    highlightSquare(uci.slice(0, 2), "blue");
    highlightSquare(uci.slice(2, 4), "blue");
    step += 1;
    inputLocked = false;
    setStatus(`${playerColor === "white" ? "White" : "Black"} to move · puzzle ${puzzle.rating}`, "ready");
  }

  function attemptMove(source, target, requestedPromotion = "") {
    clearLegalDots();
    if (inputLocked || !puzzle) return "snapback";
    const expected = puzzle.solution[step];
    if (!expected) return "snapback";

    const selectedPromotion = requestedPromotion || expected[4] || "q";
    const move = game.move({ from: source, to: target, promotion: selectedPromotion });
    if (!move) return "snapback";

    board.position(game.fen(), animationTime > 0);
    playSound(game.in_check() ? "check" : (move.captured ? "capture" : "move"));

    const isExpected = source === expected.slice(0, 2)
      && target === expected.slice(2, 4)
      && (!expected[4] || move.promotion === expected[4]);

    if (!isExpected) {
      clearHighlights();
      highlightSquare(target, "red");
      playSound("incorrect");
      inputLocked = true;
      streak = 0;
      saveStreak();
      updateUI();
      setStatus("That move is legal, but it misses the tactic.", "error");
      showDialog("Try another idea", "That move is legal, but it does not solve this position.");
      return;
    }

    clearHighlights();
    highlightSquare(source, "green");
    highlightSquare(target, "green");
    step += 1;
    inputLocked = true;

    if (step >= puzzle.solution.length) {
      streak += 1;
      saveStreak();
      updateUI();
      playSound("correct");
      setStatus(`Solved. Your streak is ${streak}.`, "ready");
      const token = sequenceId;
      window.setTimeout(() => {
        if (token === sequenceId) start();
      }, animationTime ? 800 : 0);
    } else {
      const token = sequenceId;
      window.setTimeout(() => runAutoSequence(token), animationTime ? 300 : 0);
    }
  }

  function onDrop(source, target) {
    // Dragging has no promotion picker, so retain the established behavior:
    // use the puzzle's expected piece, falling back to a queen when unspecified.
    return attemptMove(source, target);
  }

  function loadPuzzle(nextPuzzle) {
    puzzle = nextPuzzle;
    if (boardWrapper) boardWrapper.dataset.puzzleId = puzzle.id;
    sequenceId += 1;
    const token = sequenceId;
    step = 0;
    inputLocked = true;
    solutionPlaying = false;
    const initial = new Chess(puzzle.fen);
    playerColor = initial.turn() === "w" ? "black" : "white";
    game.load(puzzle.fen);
    board.orientation(playerColor);
    board.position(puzzle.fen, false);
    clearHighlights();
    clearLegalDots();

    const solutionEl = document.getElementById("solutionMoves");
    if (solutionEl) {
      solutionEl.textContent = "";
      solutionEl.closest(".panel-row")?.classList.add("hidden");
    }
    if (moveInput) moveInput.value = "";
    updateUI();
    setStatus("Watch the reply, then find the best move.");
    window.setTimeout(() => runAutoSequence(token), animationTime ? 220 : 0);
  }

  async function start() {
    if (loading) return;
    loading = true;
    sequenceId += 1;
    inputLocked = true;
    hideDialog({ restoreFocus: false });
    boardWrapper?.setAttribute("aria-busy", "true");
    setStatus("Loading a puzzle…");
    try {
      const nextPuzzle = await fetchPuzzle();
      if (!nextPuzzle) throw new Error("No puzzle was available");
      loadPuzzle(nextPuzzle);
    } catch (error) {
      console.error("Puzzle loading failed.", error);
      setStatus("The puzzle pack could not load. Use “Skip to next puzzle” to retry.", "error");
    } finally {
      loading = false;
      boardWrapper?.setAttribute("aria-busy", "false");
    }
  }

  retryBtn?.addEventListener("click", resetCurrentPuzzle);
  nextBtn?.addEventListener("click", () => start());
  solutionBtn?.addEventListener("click", playSolution);
  nextPuzzleBtn?.addEventListener("click", () => start());
  popup?.addEventListener("click", event => {
    if (event.target === popup) hideDialog();
  });
  popupBox?.addEventListener("keydown", event => {
    if (event.key === "Escape") hideDialog();
    if (event.key !== "Tab") return;
    const focusable = [...popupBox.querySelectorAll("button:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  moveForm?.addEventListener("submit", event => {
    event.preventDefault();
    const uci = moveInput?.value.trim().toLowerCase() || "";
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      setStatus("Use coordinates such as e2e4 or a7a8q.", "error");
      moveInput?.focus();
      return;
    }
    const result = attemptMove(uci.slice(0, 2), uci.slice(2, 4), uci[4] || "");
    if (result === "snapback") {
      setStatus("That move is not legal in this position.", "error");
      moveInput?.select();
    } else if (moveInput) {
      moveInput.value = "";
    }
  });

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => board.resize());
  }, { passive: true });

  updateUI();
  start();
})();
