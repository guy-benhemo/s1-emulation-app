# Desktop Analytics Verification

## Review Corrections (2026-09-08)

The company branch `feature/posthog-review-fixes` includes the original PR head
`b94467b` plus the review corrections:

- CI labels only `main` as production. Feature installers are development/test
  traffic regardless of compiler optimization. `EDR_ANALYTICS_TEST=true` also
  marks new events from a production installer as test traffic.
- A malformed or unreadable outbox entry no longer stops healthy delivery.
  Invalid entries are renamed to `.invalid` when possible and retained locally.

Local native tests: ten passed, one live test intentionally ignored. Regression
coverage includes release-channel defaults, a production QA override, malformed
JSON, unreadable entries, invalid event UUIDs, and subsequent healthy reads.
The existing full-outbox test also explicitly restores blocking mode on its
accepted TCP socket, fixing the Windows-only `WouldBlock` failure.

## Windows Acceptance (2026-09-08)

Tested application commit: `95683bb3770ff10bcdeb7328f5c33aebd3faadaa`.
[Windows CI run 34222727341](https://github.com/guardzcom/edr-attack-simulator/actions/runs/34222727341)
passed native analytics tests and built both installers. The unsigned NSIS x64
installer was installed successfully in the user's UTM Windows 11 Home ARM64 VM
(build 26100), running through Windows x64 emulation. This is not native x64
hardware validation or signed-release validation.

Installer SHA-256:
`e20753ba62fad430a110aeb9fabaf5c8177b901ce4adb4461915f1d47860bc0f`.

Runtime checks passed:

- First launch, repeated launch, and stable anonymous installation identity.
  Three offline sessions produced one first-open event and three app-open events.
- Completed Base64-only scans and cancelled scans. Cancelled run IDs had no
  scan-completed event. No full scenario-suite acceptance is claimed.
- PDF Save As cancellation and successful save. Both Letter-sized pages were
  rendered and visually inspected; the embedded CTA uses `utm_medium=pdf_report`.
- Comparison view and demo CTA; Edge opened the actual Guardz demo page with
  desktop-app UTM parameters. No form was submitted.
- A temporary outbound firewall rule scoped to the installed app retained 20
  healthy events across restarts. All nine event names were present, all marked
  `is_test=true`, `release_channel=development`, and `platform=windows`, without
  setting the runtime QA override. Original queued event IDs/timestamps survived.
- A malformed fixture was quarantined as `.invalid`, while valid events remained
  readable. After removing the rule and reopening the app, all pending JSON
  entries drained; only the quarantined fixture remained. The delivery code
  removes an entry only after the SDK acknowledges one submitted/persisted event.
- The temporary firewall rule was removed, all firewall profiles remained
  enabled, and the desktop shortcut now points to the tested installation.

One extra keyboard action during cancellation testing started the all-scenario
flow. It was cancelled after the first Certutil scenario; its temporary folder
was absent in the cleanup check. This run is included in the QA event counts.

### Independent PostHog Readback

On 2026-09-08, the authenticated Aside browser session queried PostHog project
596248 for installation `ffa406c1-7c50-420a-bfc7-2e4343ef1f3e`. The persisted
results matched the Windows build's locally recorded event UUIDs, including
first-open UUID `aaeac58b-a249-48e0-a598-30deabe60d9d`.

| Event | Persisted count |
| --- | ---: |
| edr_app_first_open | 1 |
| edr_app_opened | 4 |
| edr_scan_started | 4 |
| edr_scenario_completed | 3 |
| edr_scan_completed | 2 |
| edr_scan_cancelled | 2 |
| edr_report_exported | 3 |
| edr_comparison_viewed | 1 |
| edr_demo_clicked | 1 |

All 21 events had the expected installation ID, `is_test=true`,
`release_channel=development`, and `platform=windows`. The additional app-open
is the fourth launch that flushed the queue. Reports split into one saved and
two cancelled. Both cancelled run IDs had zero scan-completed events.
PostHog event timestamps span 12:06:16–12:22:30 UTC, with small server timestamp
adjustments relative to the local queue; UUIDs provide the exact correspondence.
The app build was established from installer provenance, not an event commit
property. No dashboard configuration was changed during verification.

Limits: the native PDF error path was not exercised. No production merge or
distribution was performed.
Local evidence (event snapshots, screenshots, PDF, and delivery checks) is in
`/tmp/edr-windows-validation` on the validation Mac.

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

The checklist below is retained from the original integration. The Windows
checks above supersede its pending build/runtime status; PDF error-path testing
and release approval remain outstanding. Independent Windows-event readback
passed as recorded above.

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
