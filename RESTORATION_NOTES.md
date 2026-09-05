# Original FaithChess appearance restored

The user requested the previous designs across all sites, keeping bug and performance fixes.

## Appearance

- Restored the original warm dark palette, centered home/puzzle/watch headings, spacing, board layouts and page copy from `4214978`.
- Removed the redesign shell, shortcut cards, new marketing copy and rounded notebook styling.
- Restored Outfit and the notebook's JetBrains Mono as locally served, licensed WOFF2 fonts with font-display swap. No Google Fonts request is required at runtime.
- Kept mobile layout safeguards, readable secondary text, keyboard focus indicators, real navigation links and reduced-motion support.

## Fixes retained

- Sanitized browser sources, disabled remote webhook submission, safe imported labels and transactional signup cleanup.
- Play parsing, legal underpromotion choices, focus-managed dialogs, settings recovery and retryable challenge failures.
- Single-flight live-board requests and back/forward-cache recovery.
- Validated local 160-puzzle pack, keyboard puzzle moves and error/skip recovery.
- Deferred opening data/entries and lazy engine loading; imported data validation and engine failure settlement.

## Verification

- The existing safety and interaction contracts pass, with a new original-theme/local-font regression check.
- Home, puzzles, watch, login, signup and the notebook were checked at narrow and desktop browser widths with no horizontal document overflow or duplicate IDs.
- Actual live-board data, mobile menu navigation, Escape/focus return and keyboard puzzle rejection/recovery were exercised.
- Production deployment/commit evidence is recorded in the portfolio restoration report.

The previously exposed webhook still needs separate revocation by its owner; restoring this design does not reintroduce it. Production authenticated multiplayer and server-side Firebase authorization remain outside the verified browser paths.
