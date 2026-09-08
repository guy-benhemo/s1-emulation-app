# Desktop Analytics Verification

## Review Corrections (2026-09-08)

The company branch `feature/posthog-review-fixes` includes the original PR head
`b94467b` plus two corrections:

- CI labels only `main` as production. Feature installers are development/test
  traffic regardless of compiler optimization. `EDR_ANALYTICS_TEST=true` also
  marks new events from a production installer as test traffic.
- A malformed or unreadable outbox entry no longer stops healthy delivery.
  Invalid entries are renamed to `.invalid` when possible and retained locally.

Local native tests: ten passed, one live test intentionally ignored. Regression
coverage includes release-channel defaults, a production QA override, malformed
JSON, unreadable entries, invalid event UUIDs, and subsequent healthy reads.
Windows build and UTM runtime acceptance are pending for this revision.

## Original Integration Evidence

Validated on 2026-09-06. Source branch: `feature/dark-redesign-and-pdf-export`.
The integration includes upstream feature-branch changes through `71d8860`.
The local main branch was not modified. This validation snapshot was recorded
before publication; review and CI status are tracked by the pull request in
`guardzcom/edr-attack-simulator`.

## Destination And Reporting

- PostHog: [EDR App (Marketing), 596248](https://us.posthog.com/project/596248/home).
- [EDR Desktop Measurement dashboard](https://us.posthog.com/project/596248/dashboard/2069605).
- Three saved charts cover first launches/app opens, scan lifecycle, and saved
  reports/comparison views/demo clicks. All exclude test events and development
  builds. Report counts require `report_status=saved`.
- All three saved charts were recalculated and returned zero production activity.
  The starter dashboard was preserved.

## Native Delivery Proof

The ignored Rust smoke test submitted nine synthetic fixtures through the actual
schema validator, disk outbox and PostHog SDK. It did not launch the app UI,
execute an attack scenario, save a real PDF, or open a demo link.

PostHog event readback and an independent trends query both confirmed one event
for each of the nine names documented in the README. The events arrived around
2026-09-06 11:00:52 UTC, under synthetic installation ID
`9b88f42a-c372-42b0-b182-543169af0397`, with `is_test=true`,
`app_surface=edr_attack_simulator`, and `platform=macos`.

This is live ingestion proof for the Rust analytics path on the validation host.
It is not proof of Windows installer execution or customer usage.

## Local Checks

- `npm run build`: passed, including TypeScript checks.
- `cargo test --manifest-path src-tauri/Cargo.toml`: eight passed; one explicit
  live-ingestion test ignored by default. That live test was run separately and
  passed before the full-queue retry correction.
- `git diff --check`: passed.
- Existing PDF bundle-size and dependency-comment build warnings remain.

## Standards Review

No documented source standards violations were found. Two non-blocking
maintenance observations remain: repeated scan-summary fields across the UI
and duplicated runtime detection. No unrelated refactor was undertaken.

## Requirements Review

One retry defect was found and fixed: when the 1,000-event outbox is full, a
subsequent tracked action now schedules delivery while preserving the enqueue
error and capacity limit. A loopback-only regression test failed before the fix
and passed after it. It also verifies rejected delivery leaves queued events
intact. The reviewer confirmed the correction addresses the finding.

## Before Distribution

1. Review the feature-branch pull request and confirm Windows CI passes.
2. Verify the new Windows installer builds and launches on an authorized Windows
   test machine. Keep any validation data out of production reporting.
3. Validate first/repeat launch, completed/cancelled runs, PDF save/cancel/error,
   comparison/demo actions, and offline/reopen delivery on that test machine.
4. Distribute only after Windows acceptance. Existing installers do not gain
   telemetry until users install a newly built version.

UTM tags identify traffic returning from the app or PDF to the website. Original
advertising attribution into the install, cross-project user identity, and
advertising-platform conversion delivery remain separate work. A new GTM
container is not required for the native PostHog integration.
