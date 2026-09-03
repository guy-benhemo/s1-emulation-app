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

Production builds require these GitHub Actions repository variables:

- `POSTHOG_PROJECT_TOKEN`: the public project token from the dedicated PostHog
  project
- `POSTHOG_HOST`: optional ingestion host, defaulting to
  `https://us.i.posthog.com`

Local builds omit telemetry when `POSTHOG_PROJECT_TOKEN` is unset. Never add a
PostHog personal API key or project secret key to the application.

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

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Framer Motion
- **Backend**: Rust (Tauri 2)
- **IPC**: `invoke()` from `@tauri-apps/api/core`
