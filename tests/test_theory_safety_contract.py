import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "theory.js").read_text(encoding="utf-8")
HTML = (ROOT / "theory.html").read_text(encoding="utf-8")


def section(start, end):
    return SCRIPT[SCRIPT.index(start):SCRIPT.index(end, SCRIPT.index(start))]


class TheorySafetyContractTests(unittest.TestCase):
    def test_imports_are_validated_before_state_is_replaced(self):
        normalizer = section("function normalizeTheoryData", "function replaceTheoryData")
        self.assertIn("if(!Array.isArray(data))", normalizer)
        self.assertIn("if(!Array.isArray(rawTags))", normalizer)
        self.assertIn("`${path}.tags must be an array.`", normalizer)
        self.assertIn("game.move(san, { sloppy:true })", normalizer)
        self.assertIn("is not legal from the preceding position", normalizer)
        self.assertIn("LINES = normalized;", SCRIPT)
        self.assertIn("LINES=normalizeTheoryData(candidate);", SCRIPT)
        self.assertNotRegex(SCRIPT, r"LINES\s*=\s*(?:data|parsed)\s*;")
        self.assertIn("replaceTheoryData(data);", SCRIPT)
        self.assertIn("replaceTheoryData(parsed);", SCRIPT)

    def test_remote_and_imported_labels_are_rendered_as_text(self):
        eco_renderer = section("function renderEcoList", "async function ensureEcoList")
        self.assertIn("titleEl.textContent = title;", eco_renderer)
        self.assertNotIn("card.innerHTML", eco_renderer)

        block_renderer = section("function buildBlocks", "function buildEntry")
        self.assertIn("label.textContent=block.popularity", block_renderer)
        self.assertNotIn("pw.innerHTML", block_renderer)

    def test_engine_failures_settle_jobs_instead_of_hanging(self):
        self.assertIn("function failEngineJobs(finalStatus)", SCRIPT)
        self.assertIn("failEngineJobs('engine unavailable')", SCRIPT)
        self.assertIn("failEngineJobs('engine error')", SCRIPT)
        self.assertIn("finishCurrentSearch('engine timeout')", SCRIPT)
        self.assertIn("if(!EVAL_POOL.workers.length)", SCRIPT)
        self.assertIn("resolve(null);", section("function requestParallelEval", "function finishCurrentSearch"))
        bot = section("function maybeBotMove", "function handleSquareClick")
        self.assertIn("botThinking = false;", bot)
        self.assertIn("['engine unavailable','engine error','engine timeout']", bot)

    def test_practice_supports_keyboard_moves_and_accessible_promotion(self):
        self.assertIn("moveLabel.textContent = 'Keyboard move'", SCRIPT)
        self.assertIn("moveForm.addEventListener('submit'", SCRIPT)
        self.assertIn("tryPlayerMove(from, to, uci[4] || '')", SCRIPT)
        promotion = section("function renderPromotionOverlay", "function currentState")
        self.assertIn("btn.addEventListener('click'", promotion)
        self.assertIn("finishPromotion(pc);", promotion)
        self.assertIn("requestAnimationFrame(()=>gw.querySelector('.promo-inline-btn')?.focus())", SCRIPT)

    def test_settings_and_arrow_navigation_keep_accessible_focus_contracts(self):
        self.assertIn('<label for="sq-slider"', HTML)
        self.assertIn('<label for="txt-slider"', HTML)
        self.assertIn("if(overlay.style.display !== 'flex') overlay._returnFocus", SCRIPT)
        arrows = section("window.addEventListener('keydown'", "// ─── Header buttons")
        self.assertIn("if(e.defaultPrevented) return;", arrows)
        self.assertIn("button,input,textarea,select", arrows)

    def test_watch_loads_settings_before_board_initialization(self):
        watch = (ROOT / "watch.html").read_text(encoding="utf-8")
        self.assertLess(watch.index('src="settings.js'), watch.index('src="grid.js'))


if __name__ == "__main__":
    unittest.main()
