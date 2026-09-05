import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PlayInteractionContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "play.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "play.js").read_text(encoding="utf-8")

    def test_promotion_chooser_offers_every_legal_piece_accessibly(self):
        overlay = re.search(r'<div id="promotionOverlay"[^>]+>', self.html)
        self.assertIsNotNone(overlay)
        self.assertIn('role="dialog"', overlay.group(0))
        self.assertIn('aria-modal="true"', overlay.group(0))
        self.assertIn('aria-labelledby="promotionTitle"', overlay.group(0))
        self.assertIn('aria-describedby="promotionHelp"', overlay.group(0))

        choices = re.findall(r'data-promotion="([qrbn])"', self.html)
        self.assertEqual(["q", "r", "b", "n"], choices)
        for piece in ("queen", "rook", "bishop", "knight"):
            self.assertIn(f'aria-label="Promote to {piece}"', self.html)

    def test_back_rank_drop_waits_for_the_selected_promotion(self):
        move_section = self.script[
            self.script.index("function commitMove"):
            self.script.index("// PUSH MOVE TO FIREBASE")
        ]
        self.assertIn('if (promotion) moveData.promotion = promotion;', move_section)
        self.assertIn('Boolean(move.promotion)', move_section)
        self.assertIn('openPromotionChooser(source, target);', move_section)
        self.assertIn('commitMove(pending.source, pending.target, promotion)', move_section)
        self.assertIn('return "snapback";', move_section)
        self.assertNotIn('promotion: "q"', move_section)

    def test_promotion_dialog_traps_focus_and_supports_cancel(self):
        self.assertIn('trapDialogFocus(event, promotionOverlay);', self.script)
        self.assertIn('if (event.key === "Escape")', self.script)
        self.assertIn('promotionCancel?.addEventListener("click", () => closePromotionChooser())', self.script)
        self.assertIn('window.requestAnimationFrame(() => promotionButtons[0]?.focus())', self.script)
        self.assertIn('restoreFocus(returnTarget);', self.script)

    def test_game_over_is_announced_and_manages_focus(self):
        overlay = re.search(r'<div id="gameoverOverlay"[^>]+>', self.html)
        self.assertIsNotNone(overlay)
        self.assertIn('role="alertdialog"', overlay.group(0))
        self.assertIn('aria-modal="true"', overlay.group(0))
        self.assertIn('aria-atomic="true"', overlay.group(0))
        self.assertIn('aria-labelledby="goTitle"', overlay.group(0))
        self.assertIn('aria-describedby="goSub goRating"', overlay.group(0))
        self.assertIn("gameOverReturnFocus = rememberFocus();", self.script)
        self.assertIn("trapDialogFocus(event, gameOverOverlay);", self.script)
        self.assertIn(
            "window.requestAnimationFrame(() => dialogButtons(gameOverOverlay)[0]?.focus())",
            self.script,
        )
        self.assertIn('const returnTarget = hideGameOver({ restore: false });', self.script)
        self.assertIn("restoreFocus(returnTarget);", self.script)


if __name__ == "__main__":
    unittest.main()
