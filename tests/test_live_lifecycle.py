import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LiveLifecycleTests(unittest.TestCase):
    def test_failed_challenge_returns_to_an_enabled_retry_state(self):
        source = (ROOT / "profile.html").read_text(encoding="utf-8")
        handler = re.search(
            r"btn\.onclick = async \(\) => \{.*?\n      \};",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(handler)
        handler_source = handler.group(0)
        self.assertIn("sent = await window.sendChallenge", handler_source)
        self.assertIn("if (!sent)", handler_source)
        self.assertIn("btn.disabled = false;", handler_source)
        self.assertIn('btn.textContent = "⚠ Not sent — try again";', handler_source)
        self.assertLess(
            handler_source.index("if (!sent)"),
            handler_source.index('btn.textContent = "✓ Challenge Sent";'),
        )

    def test_live_refreshers_are_single_flight_and_resume_from_bfcache(self):
        for filename in ("live.js", "grid.js"):
            source = (ROOT / filename).read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn("let updateInFlight = false;", source)
                self.assertIn("if (updateInFlight)", source)
                self.assertIn("updateInFlight = true;", source)
                self.assertIn("updateInFlight = false;", source)
                self.assertIn("refreshQueued = true;", source)
                self.assertIn('window.addEventListener("pageshow", event => {', source)
                self.assertIn("if (!event.persisted) return;", source)
                self.assertIn("stopped = false;", source)
                self.assertIn("schedule(0);", source)
                self.assertIn("for (const controller of activeControllers) controller.abort();", source)
                self.assertNotIn('}, { once: true });', source)


if __name__ == "__main__":
    unittest.main()
