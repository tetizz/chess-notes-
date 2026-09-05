# FaithChess redesign notes

This redesign and reliability pass was published to the `refresh-faithchess` branch. The user authorized merging it into `main` and publishing the site; deployment verification is recorded in the portfolio results report.

## What changed

- Rebuilt the shared navigation, home, puzzles, watch, authentication, settings, profile, arena, play, and Opening Lab interfaces around one responsive FaithChess system.
- Added keyboard and focus behavior, reduced-motion support, semantic loading and error states, safer DOM rendering, storage recovery, and local piece assets.
- Replaced the unavailable giant puzzle runtime dependency with a validated 160-position legal puzzle pack.
- Fixed the Play page parse failure caused by duplicate query-parameter declarations.
- Added explicit queen, rook, bishop, and knight promotion choices to online play, plus stale-position protection and an accessible game-over dialog.
- Made username claiming transactional and added compensating cleanup when account creation or profile setup fails.
- Hardened live boards against overlapping requests and back/forward-cache restores, and made challenge failures retryable instead of reporting false success.
- Deferred Opening Lab entries, split and minified its embedded notebook data, and delayed the 10.5 MB Stockfish engine until analysis is actually requested.
- Validated imported and edited Opening Lab data before replacing saved state, rendered imported labels as text, settled failed or timed-out engine jobs, and added keyboard move entry with an accessible promotion chooser.
- Removed the browser-delivered Discord webhook credential and disabled remote review submission until a server-side endpoint exists.

## Verification snapshot

- `python -m unittest discover -s tests -v`: 26 passed.
- Every external JavaScript file and every remaining inline script parses successfully.
- Home, Puzzles, Watch, Opening Lab, Log In, and Sign Up were exercised at requested widths of 320, 390, 768, and 1440 pixels with no document overflow, duplicate IDs, unnamed visible controls, or console messages.
- The 160 local puzzles replay legally with python-chess; correct, incorrect, retry, solution, keyboard, drag, dialog, and next-puzzle paths were exercised in Chromium.
- Opening Lab deferred-entry loading, nested keyboard tabs, modal focus return, responsive boards, malformed-import rejection, literal rendering of hostile labels, keyboard practice, and a real lazy Stockfish reply were exercised.
- Home and Watch were restored through real back/forward navigation without stale status or console errors.
- Lighthouse mobile results: Home 98/100/100/100; Puzzles 98/100/100/100; Opening Lab 90/100/100/100 (performance/accessibility/best practices/SEO).
- Opening Lab's initial transfer fell from roughly 11.2 MB to 411 KiB by deferring Stockfish; the engine still loaded and answered when requested.

## Credential cleanup and remaining verification

**Revoke or rotate the previously exposed Discord webhook.** The pre-release live page was confirmed to still deliver that credential, while this version contains no webhook credential and disables the old remote submission path. Publishing the sanitized version removes the current live exposure; revocation remains a separate account action because source removal cannot invalidate copies in Git history or caches. This publication does not claim that the credential has been revoked. Decide separately whether published history must be rewritten.

Firebase-authenticated Play, Arena, Settings, and Profile workflows were not exercised against a production account. No Firebase Realtime Database rules are present in this checkout, so server-side authorization and adversarial two-client behavior remain unverified; multiplayer clocks, moves, and results also remain client-authoritative. Third-party CDN scripts do not currently have a Content Security Policy or Subresource Integrity coverage, and the Cloudinary unsigned-upload preset was not inspected. Verification used Chromium plus automated audits; Firefox, Safari, and a manual screen-reader pass remain outstanding.
