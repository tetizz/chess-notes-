import json
import re
import unittest
from pathlib import Path

import chess


ROOT = Path(__file__).resolve().parents[1]
SHELL_PAGES = [
    "index.html",
    "play.html",
    "arena.html",
    "puzzles.html",
    "watch.html",
    "profile.html",
    "settings.html",
    "login.html",
    "signup.html",
]


class InterfaceContractTests(unittest.TestCase):
    def test_shell_pages_keep_header_and_main_landmarks(self):
        for name in SHELL_PAGES:
            source = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertRegex(source, r"<header(?:\s|>)")
                self.assertRegex(source, r"<main(?:\s|>)")
                self.assertRegex(source, r'src="nav\.js(?:\?[^\"]+)?"')

    def test_runtime_does_not_request_giant_csv_or_remote_fonts(self):
        runtime = "\n".join(
            path.read_text(encoding="utf-8")
            for path in [*ROOT.glob("*.html"), *ROOT.glob("*.js")]
        )
        self.assertNotIn("fonts.googleapis.com", runtime)
        self.assertNotIn("media.githubusercontent.com/media/veefs", runtime)
        self.assertNotIn("chessboardjs.com/img/chesspieces", runtime)

    def test_navigation_uses_links_and_expanded_state(self):
        source = (ROOT / "nav.js").read_text(encoding="utf-8")
        self.assertIn('element("nav", "nav")', source)
        self.assertIn('link.href = page.href', source)
        self.assertIn('aria-current', source)
        self.assertIn('aria-expanded', source)
        self.assertNotIn('onclick="window.location.href', source)

    def test_puzzle_ui_ids_match_script_contract(self):
        html = (ROOT / "puzzles.html").read_text(encoding="utf-8")
        script = (ROOT / "puzzles.js").read_text(encoding="utf-8")
        required_ids = {
            "sideToMove",
            "puzzleRating",
            "streakCount",
            "solutionMoves",
            "puzzleStatus",
            "puzzleMoveForm",
            "nextPuzzleBtn",
        }
        for element_id in required_ids:
            with self.subTest(element_id=element_id):
                self.assertIn(f'id="{element_id}"', html)
                self.assertIn(f'"{element_id}"', script)

    def test_typed_puzzle_promotion_is_not_replaced_by_expected_piece(self):
        script = (ROOT / "puzzles.js").read_text(encoding="utf-8")
        self.assertIn('function attemptMove(source, target, requestedPromotion = "")', script)
        self.assertIn('const selectedPromotion = requestedPromotion || expected[4] || "q";', script)
        self.assertIn(
            'attemptMove(uci.slice(0, 2), uci.slice(2, 4), uci[4] || "")',
            script,
        )
        self.assertIn("return attemptMove(source, target);", script)
        self.assertNotIn(
            'game.move({ from: source, to: target, promotion: expected[4] || "q" })',
            script,
        )

    def test_local_puzzle_pack_is_complete_and_legal(self):
        puzzles = json.loads((ROOT / "puzzles-sample.json").read_text(encoding="utf-8"))
        self.assertEqual(160, len(puzzles))
        seen = set()
        for puzzle in puzzles:
            with self.subTest(puzzle=puzzle.get("id")):
                self.assertNotIn(puzzle["id"], seen)
                seen.add(puzzle["id"])
                self.assertIsInstance(puzzle["rating"], int)
                board = chess.Board(puzzle["fen"])
                self.assertGreaterEqual(len(puzzle["solution"]), 2)
                for uci in puzzle["solution"]:
                    self.assertRegex(uci, r"^[a-h][1-8][a-h][1-8][qrbn]?$")
                    move = chess.Move.from_uci(uci)
                    self.assertIn(move, board.legal_moves)
                    board.push(move)

    def test_configured_piece_sets_have_every_color_piece(self):
        settings = (ROOT / "settings.html").read_text(encoding="utf-8")
        configured = re.findall(r'<option value="([^"]+)">[^<]+</option>', settings)
        configured = [value for value in configured if (ROOT / "pieces" / value).is_dir()]
        required = {f"{color}{piece}" for color in "bw" for piece in "KQRBNP"}
        self.assertGreaterEqual(len(configured), 20)
        for piece_set in configured:
            extension = ".webp" if piece_set == "monarchy" else ".svg"
            available = {path.stem for path in (ROOT / "pieces" / piece_set).glob(f"*{extension}")}
            with self.subTest(piece_set=piece_set):
                self.assertEqual(required, available)

    def test_settings_recover_from_corrupt_storage(self):
        source = (ROOT / "settings.js").read_text(encoding="utf-8")
        self.assertIn("try {", source)
        self.assertIn("JSON.parse", source)
        self.assertIn("return { ...DEFAULTS };", source)
        self.assertIn("window.getPieceTheme", source)

    def test_play_script_has_one_query_parameter_declaration(self):
        source = (ROOT / "play.js").read_text(encoding="utf-8")
        self.assertEqual(1, source.count("const params        = new URLSearchParams"))

    def test_theory_page_defers_heavy_entries_and_preserves_tab_semantics(self):
        html = (ROOT / "theory.html").read_text(encoding="utf-8")
        script = (ROOT / "theory.js").read_text(encoding="utf-8")
        self.assertIn('src="theory-data.js', html)
        self.assertIn('src="theory.js', html)
        self.assertIn("buildEntry(entry, i, tabTree, i>0)", script)
        self.assertIn("renderers[0]?.()", script)
        self.assertIn("setAttribute('role','tab')", script)
        self.assertIn("setAttribute('aria-selected'", script)
        self.assertIn("Math.floor((document.documentElement.clientWidth-62)/8)", script)
        self.assertIn('role="dialog" aria-modal="true"', html)

    def test_browser_sources_do_not_contain_webhook_or_private_key_credentials(self):
        runtime = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in [*ROOT.glob("*.html"), *ROOT.glob("*.js")]
        )
        self.assertNotIn("discord.com/api/webhooks", runtime.lower())
        self.assertNotIn("-----begin private key-----", runtime.lower())


if __name__ == "__main__":
    unittest.main()
