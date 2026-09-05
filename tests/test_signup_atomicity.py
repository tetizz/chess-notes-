import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "signup.html").read_text(encoding="utf-8")


class SignupAtomicityTests(unittest.TestCase):
    def test_username_is_claimed_transactionally_as_the_uid(self):
        self.assertIn("runTransaction(usernameRef", SOURCE)
        self.assertIn("if (currentUid === null) return uid;", SOURCE)
        self.assertIn("claim.snapshot.val() === uid", SOURCE)
        self.assertNotIn("await get(ref(db, `usernames/", SOURCE)

        create_at = SOURCE.index("await createUserWithEmailAndPassword")
        claim_at = SOURCE.index("await runTransaction(usernameRef")
        profile_at = SOURCE.index("await update(ref(db)")
        self.assertLess(create_at, claim_at)
        self.assertLess(claim_at, profile_at)

    def test_failed_setup_releases_only_its_own_claim_and_deletes_auth(self):
        rollback = re.search(
            r"async function rollbackIncompleteSignup\(.*?\n  }\n\n  function friendlyError",
            SOURCE,
            re.DOTALL,
        )
        self.assertIsNotNone(rollback)
        rollback_source = rollback.group(0)
        self.assertIn("if (currentUid === user.uid) return null;", rollback_source)
        self.assertIn("await deleteUser(user);", rollback_source)
        self.assertIn("usernameReleased && authDeleted", rollback_source)

    def test_username_lookup_contract_remains_a_plain_uid(self):
        profile_source = (ROOT / "profile.html").read_text(encoding="utf-8")
        self.assertIn("const targetUid = uidSnap.val();", profile_source)
        self.assertNotIn("return { uid", SOURCE)


if __name__ == "__main__":
    unittest.main()
