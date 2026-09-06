# EDR Attack Simulator

A Windows desktop application that runs safe, self-cleaning attack emulations against Windows endpoints to validate whether an EDR detects and blocks common threat techniques.

Built with **Tauri 2 + React 19 + TypeScript** (Rust backend, React frontend).

## Attack Scenarios

| # | Scenario | Category | Technique |
|---|----------|----------|-----------|
| 1 | Certutil SAM Dump | Credential Access | DPAPI, Credential Vault, LSASS handle probing, offensive tool strings (NinjaCopy, Kerberoast, DCSync), and `certutil -encode` |
| 2 | RDP Enable via Registry | Persistence | Directly modifies `fDenyTSConnections` registry key and opens firewall port 3389 via `reg add`, `netsh`, and `Set-ItemProperty` |
| 3 | AMSI Bypass via Reflection | Behavioral | Sets `amsiInitFailed` to `$true` via .NET Reflection with `[String]::Join` obfuscation to bypass AV static scan |
| 4 | LSASS Handle Access | Credential Access | Spawns credential harvesting processes (procdump, comsvcs MiniDump, mimikatz patterns) via batch files |
| 5 | Reverse Shell (TCP) | Exfiltration | Opens TCP socket to localhost with StreamReader/StreamWriter simulating C2 callback |
| 6 | Scheduled Task Persistence | Persistence | Creates persistence entries via registry Run keys, scheduled tasks, WMI subscriptions, and startup folder |
| 7 | Base64 Encoded Execution | Static Detection | Encodes a reverse shell pattern (TCP socket + whoami) and runs via `powershell -EncodedCommand` |
| 8 | LOLBin File Download | LOLBin | Uses `curl.exe` to silently download from a dummy URL — a trusted system binary LOLBin technique |
| 9 | BloodHound AD Recon | Reconnaissance | Emulates `Invoke-BloodHound` AD enumeration commands targeting a fake domain |

All scenarios are **safe and self-cleaning** — they create benign artifacts, verify detection, and remove all traces automatically.

## Result Statuses

- **Executed** — the attack completed successfully, meaning the endpoint is vulnerable (EDR/AV did not block it)
- **Blocked** — the EDR/AV detected and stopped the attack (desired outcome)
- **Error** — the scenario failed to run (process killed by AV before completion)

## Evasion Strategy

The binary uses Rust-level string concatenation (`j()`) to split suspicious strings in the compiled executable, preventing AV from flagging the app during download/install. At runtime, the scripts execute with full unobfuscated strings so that EDR behavioral detection can identify the attack patterns. PowerShell scripts use `[String]::Join` obfuscation only where needed to bypass Defender's static script scan while remaining detectable by EDR.

## Development

```bash
npm run tauri dev      # Start dev (Vite + Tauri)
npm run tauri build    # Production build
npm run dev            # Frontend only (no Tauri window)
npx tsc --noEmit       # TypeScript check
```

## Product analytics

The Windows build sends personless product events through the native Rust
backend using the official `posthog-rs` SDK. Events are validated against a
fixed schema and written to an app-data outbox before delivery, so a temporary
network failure does not lose the measurement trail.

Windows CI builds target [EDR App (Marketing), project 596248](https://us.posthog.com/project/596248/home).
The Windows workflow supplies its public ingestion token and the US ingestion
host at job level, covering both signed and unsigned builds. The token can send
events but cannot read project data or administer the account. It is not a
personal API key or project secret.

Local builds omit telemetry when `POSTHOG_PROJECT_TOKEN` is unset. Never add a
PostHog personal API key or project secret key to the application.

For an explicitly measured local build, set `POSTHOG_PROJECT_TOKEN` to the
project's public token. `POSTHOG_HOST` defaults to `https://us.i.posthog.com`.
The build must be rebuilt after changing these values because Rust embeds them
at compile time. No browser GTM container is installed in the desktop app.

Captured events:

- `edr_app_first_open`
- `edr_app_opened`
- `edr_scan_started`
- `edr_scenario_completed`
- `edr_scan_cancelled`
- `edr_scan_completed`
- `edr_report_exported`
- `edr_comparison_viewed`
- `edr_demo_clicked`

The event schema excludes PowerShell output, errors, hostnames, usernames, IP
address properties, and report paths. PostHog GeoIP enrichment is disabled.

All events carry `app_surface=edr_attack_simulator`, `app_version`, `platform`,
`release_channel`, `installation_id`, `session_id`, and `is_test`. Production
reporting should exclude `is_test=true` and `release_channel=development`.
`edr_app_first_open` measures first launch, not a completed installer or download.
Use `report_status=saved` when counting successfully exported reports.

Demo links preserve `utm_source=edr_attack_sim` and add
`utm_campaign=s1_simulation`. The app uses `utm_medium=desktop_app` and
`utm_content=compare_screen`; exported PDFs use `utm_medium=pdf_report` and
`utm_content=report_cta`. These identify traffic returning from the tool. They do
not carry the original ad-click attribution from the website into the installed
app, join users across PostHog projects, or send advertising-platform conversions.
Those require a separately agreed identity/attribution handoff.

### Verification

Run `npm run build` and `cargo test --manifest-path src-tauri/Cargo.toml`.
The Windows workflow also runs native analytics unit tests before building.
The ignored `live_posthog_smoke_test` sends exactly nine synthetic events through
the actual Rust queue and SDK, without launching the UI or executing scenarios:

```bash
cargo test --manifest-path src-tauri/Cargo.toml live_posthog_smoke_test -- --ignored --nocapture
```

It requires `POSTHOG_SMOKE_TOKEN` explicitly in the environment. Every emitted
event has `is_test=true`, the real host platform, and a fresh anonymous installation
ID printed for readback. Delivery acknowledgement alone is not ingestion proof;
verify all nine events in PostHog before declaring the connection working.

Events still awaiting delivery remain in the local outbox and are retried on
the next tracked action or app launch. The outbox is capped at 1,000 events;
additional events are not stored when full. Offline capture is not unlimited,
and permanently blocked network access cannot deliver analytics.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Framer Motion
- **Backend**: Rust (Tauri 2)
- **IPC**: `invoke()` from `@tauri-apps/api/core`

## Windows Code Signing

Unsigned installers show "unknown publisher" on download. Signing is wired up in
`.github/workflows/build-windows.yml` via **Azure Artifact Signing** (formerly
Trusted Signing, ~$9.99/month) and runs **only on `main`**, and only once the
repo variable `AZURE_SIGNING_ENABLED` is set to `true`. Until then every branch —
`main` included — builds unsigned exactly as before, so nothing changes today.

### Azure side (one-time, needs a subscription owner)

1. Register the `Microsoft.CodeSigning` resource provider on the subscription.
2. Create an **Artifact Signing account** in a supported region (e.g. `westus2`).
3. Submit an **Identity Validation** request of type *Public Trust* for Guardz.
   This is the long pole — Microsoft verifies the legal entity and it takes
   business days, not minutes. Requires a legally registered org with 3+ years
   of verifiable history.
4. Once validation succeeds, create a **Certificate Profile** (*Public Trust*).
5. Create an **App Registration** with a client secret for CI, and grant its
   service principal the **Trusted Signing Certificate Profile Signer** role on
   the signing account.

### GitHub side

Repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Example | Meaning |
|---|---|---|
| `AZURE_SIGNING_ENABLED` | `true` | Master switch. Signing stays off until this is `true`. |
| `AZURE_SIGNING_ENDPOINT` | `https://wus2.codesigning.azure.net` | Region endpoint of the signing account. |
| `AZURE_SIGNING_ACCOUNT` | `guardz-signing` | Artifact Signing account name. |
| `AZURE_SIGNING_PROFILE` | `guardz-public-trust` | Certificate profile name. |

Repository **secrets**:

| Secret | Meaning |
|---|---|
| `AZURE_CLIENT_ID` | App Registration (client) ID of the CI identity. |
| `AZURE_CLIENT_SECRET` | Client secret for that App Registration. |
| `AZURE_TENANT_ID` | Guardz Azure AD tenant ID. |

`artifact-signing-cli` reads these three from the environment. Note the client
secret has an expiry — when it lapses, signed builds on `main` start failing
with an auth error, so set a calendar reminder to rotate it. The signing key
itself never leaves Microsoft's HSM and is never present in CI.

### Turning it on

Set the three `AZURE_SIGNING_*` value variables and the three secrets, then flip
`AZURE_SIGNING_ENABLED` to `true` and push to `main`. The workflow fails fast
with an explicit list if anything is missing, installs `artifact-signing-cli`,
signs during bundling, and then verifies every `.exe` and `.msi` with
`Get-AuthenticodeSignature` — an installer that is not genuinely signed fails
the build rather than shipping.

Note this repo currently lives under the personal `guy-benhemo` account rather
than the `guardzcom` org. Pointing Guardz Azure credentials at a personal repo
is a governance decision worth settling before this is switched on.

### What signing does and does not fix

Signing replaces "unknown publisher" with **Guardz**. It does *not* clear
SmartScreen immediately — Artifact Signing certificates are OV-class, so the
"Windows protected your PC" prompt can persist until the installer accrues
download reputation. Only an EV certificate skips that from day one.

Signing also does not stop Defender or a third-party EDR flagging the emulated
attacks themselves — for this app that is the intended behaviour, see
[Evasion Strategy](#evasion-strategy).
