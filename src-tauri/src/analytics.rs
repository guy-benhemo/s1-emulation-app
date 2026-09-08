use chrono::{DateTime, Utc};
use posthog_rs::{Client, ClientOptionsBuilder, Event};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, Runtime};
use tokio::sync::{Mutex as AsyncMutex, OnceCell};
use uuid::Uuid;

const MAX_OUTBOX_EVENTS: usize = 1_000;
const DEFAULT_POSTHOG_HOST: &str = "https://us.i.posthog.com";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEvent {
    name: String,
    #[serde(default)]
    properties: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct PendingEvent {
    id: String,
    name: String,
    distinct_id: String,
    occurred_at_ms: i64,
    properties: BTreeMap<String, Value>,
}

#[derive(Clone)]
pub struct AnalyticsState(Arc<AnalyticsInner>);

struct AnalyticsInner {
    project_token: Option<String>,
    host: String,
    release_channel: &'static str,
    is_test: bool,
    installation_id: String,
    session_id: String,
    first_open_marker: PathBuf,
    outbox_dir: PathBuf,
    file_lock: Mutex<()>,
    delivery_lock: AsyncMutex<()>,
    client: OnceCell<Arc<Client>>,
}

impl AnalyticsState {
    pub fn new<R: Runtime>(app: &tauri::AppHandle<R>) -> io::Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| io::Error::other(error.to_string()))?;
        fs::create_dir_all(&data_dir)?;

        let installation_id = load_or_create_installation_id(&data_dir)?;
        let outbox_dir = data_dir.join("analytics-outbox");
        fs::create_dir_all(&outbox_dir)?;

        let project_token = option_env!("POSTHOG_PROJECT_TOKEN")
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .map(str::to_owned);
        let host = option_env!("POSTHOG_HOST")
            .map(str::trim)
            .filter(|host| !host.is_empty())
            .unwrap_or(DEFAULT_POSTHOG_HOST)
            .to_owned();
        let (release_channel, is_test) = analytics_environment(
            option_env!("EDR_RELEASE_CHANNEL"),
            std::env::var("EDR_ANALYTICS_TEST").ok().as_deref(),
        );

        Ok(Self(Arc::new(AnalyticsInner {
            project_token,
            host,
            release_channel,
            is_test: is_test || cfg!(test),
            installation_id,
            session_id: Uuid::new_v4().to_string(),
            first_open_marker: data_dir.join("analytics-first-open-queued"),
            outbox_dir,
            file_lock: Mutex::new(()),
            delivery_lock: AsyncMutex::new(()),
            client: OnceCell::new(),
        })))
    }

    pub fn disabled() -> Self {
        Self(Arc::new(AnalyticsInner {
            project_token: None,
            host: DEFAULT_POSTHOG_HOST.to_owned(),
            release_channel: "development",
            is_test: true,
            installation_id: Uuid::new_v4().to_string(),
            session_id: Uuid::new_v4().to_string(),
            first_open_marker: PathBuf::new(),
            outbox_dir: PathBuf::new(),
            file_lock: Mutex::new(()),
            delivery_lock: AsyncMutex::new(()),
            client: OnceCell::new(),
        }))
    }

    pub fn capture_startup(&self) {
        if !self.is_enabled() {
            return;
        }

        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            if !state.0.first_open_marker.exists() {
                if state
                    .queue_event(AnalyticsEvent {
                        name: "edr_app_first_open".to_owned(),
                        properties: BTreeMap::new(),
                    })
                    .is_ok()
                {
                    let _ = write_new_file(&state.0.first_open_marker, b"queued\n");
                }
            }

            let _ = state.queue_event(AnalyticsEvent {
                name: "edr_app_opened".to_owned(),
                properties: BTreeMap::new(),
            });
            state.flush_pending().await;
        });
    }

    fn is_enabled(&self) -> bool {
        self.0.project_token.is_some()
    }

    fn queue_event(&self, event: AnalyticsEvent) -> Result<bool, String> {
        if !self.is_enabled() {
            return Ok(false);
        }

        validate_event(&event)?;

        let mut properties = event.properties;
        properties.insert("schema_version".to_owned(), Value::String("1".to_owned()));
        properties.insert(
            "app_version".to_owned(),
            Value::String(env!("CARGO_PKG_VERSION").to_owned()),
        );
        properties.insert(
            "platform".to_owned(),
            Value::String(std::env::consts::OS.to_owned()),
        );
        properties.insert("runtime".to_owned(), Value::String("tauri".to_owned()));
        properties.insert(
            "app_surface".to_owned(),
            Value::String("edr_attack_simulator".to_owned()),
        );
        properties.insert("is_test".to_owned(), Value::Bool(self.0.is_test));
        properties.insert(
            "release_channel".to_owned(),
            Value::String(self.0.release_channel.to_owned()),
        );
        properties.insert(
            "installation_id".to_owned(),
            Value::String(self.0.installation_id.clone()),
        );
        properties.insert(
            "session_id".to_owned(),
            Value::String(self.0.session_id.clone()),
        );

        let pending = PendingEvent {
            id: Uuid::new_v4().to_string(),
            name: event.name,
            distinct_id: self.0.installation_id.clone(),
            occurred_at_ms: now_ms(),
            properties,
        };

        let _guard = self
            .0
            .file_lock
            .lock()
            .map_err(|_| "Analytics outbox lock was poisoned".to_owned())?;
        let pending_count = pending_paths(&self.0.outbox_dir)
            .map_err(|error| format!("Could not inspect analytics outbox: {error}"))?
            .len();
        if pending_count >= MAX_OUTBOX_EVENTS {
            return Err("Analytics outbox is full".to_owned());
        }
        persist_pending(&self.0.outbox_dir, &pending)
            .map_err(|error| format!("Could not queue analytics event: {error}"))?;
        Ok(true)
    }

    pub fn track(&self, event: AnalyticsEvent) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }

        let queued = self.queue_event(event);
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            state.flush_pending().await;
        });
        queued.map(|_| ())
    }

    async fn client(&self) -> Result<&Arc<Client>, String> {
        let token = self
            .0
            .project_token
            .as_ref()
            .ok_or_else(|| "PostHog is not configured".to_owned())?
            .clone();
        self.0
            .client
            .get_or_try_init(|| async {
                let options = ClientOptionsBuilder::default()
                    .api_key(token)
                    .host(self.0.host.clone())
                    .disable_geoip(true)
                    .is_server(false)
                    .request_timeout_seconds(8)
                    .max_capture_attempts(3)
                    .build()
                    .map_err(|error| error.to_string())?;
                Ok::<Arc<Client>, String>(Arc::new(posthog_rs::client(options).await))
            })
            .await
    }

    async fn flush_pending(&self) {
        let _delivery_guard = self.0.delivery_lock.lock().await;
        let client = match self.client().await {
            Ok(client) => client,
            Err(error) => {
                eprintln!("Could not initialize PostHog: {error}");
                return;
            }
        };

        loop {
            let next = {
                let Ok(_file_guard) = self.0.file_lock.lock() else {
                    return;
                };
                match read_pending(&self.0.outbox_dir) {
                    Ok(mut events) => {
                        events.sort_by_key(|event| event.occurred_at_ms);
                        events.into_iter().next()
                    }
                    Err(error) => {
                        eprintln!("Could not read analytics outbox: {error}");
                        return;
                    }
                }
            };

            let Some(pending) = next else {
                return;
            };

            let event = match posthog_event(&pending) {
                Ok(event) => event,
                Err(error) => {
                    eprintln!("Could not construct queued analytics event: {error}");
                    return;
                }
            };

            match client.capture_immediate(event).await {
                Ok(summary) if summary.submitted() == 1 && summary.all_persisted() => {
                    let Ok(_file_guard) = self.0.file_lock.lock() else {
                        return;
                    };
                    if let Err(error) = fs::remove_file(pending_path(&self.0.outbox_dir, &pending))
                    {
                        if error.kind() != io::ErrorKind::NotFound {
                            eprintln!("Could not acknowledge analytics event: {error}");
                            return;
                        }
                    }
                }
                Ok(_) => return,
                Err(error) => {
                    eprintln!("PostHog delivery failed; event retained for retry: {error}");
                    return;
                }
            }
        }
    }
}

#[tauri::command]
pub async fn track_event(
    state: tauri::State<'_, AnalyticsState>,
    event: AnalyticsEvent,
) -> Result<(), String> {
    state.track(event)
}

fn validate_event(event: &AnalyticsEvent) -> Result<(), String> {
    if !matches!(
        event.name.as_str(),
        "edr_app_first_open"
            | "edr_app_opened"
            | "edr_scan_started"
            | "edr_scenario_completed"
            | "edr_scan_cancelled"
            | "edr_scan_completed"
            | "edr_report_exported"
            | "edr_comparison_viewed"
            | "edr_demo_clicked"
    ) {
        return Err("Unknown analytics event".to_owned());
    }

    for (key, value) in &event.properties {
        if !allowed_property(&event.name, key) {
            return Err(format!("Property is not allowed for {}", event.name));
        }
        match value {
            Value::Bool(_) | Value::Number(_) => {}
            Value::String(value) if value.len() <= 128 => {}
            Value::String(_) => return Err("Analytics property is too long".to_owned()),
            _ => return Err("Analytics properties must be scalar".to_owned()),
        }
        if !allowed_value(key, value) {
            return Err(format!("Property value is invalid for {key}"));
        }
    }

    Ok(())
}

fn allowed_value(key: &str, value: &Value) -> bool {
    match key {
        "run_id" => value
            .as_str()
            .is_some_and(|value| Uuid::parse_str(value).is_ok()),
        "scan_mode" => matches!(value.as_str(), Some("full" | "selected" | "rerun")),
        "scenario_id" => matches!(
            value.as_str(),
            Some(
                "certutil-dump"
                    | "rdp-enable"
                    | "amsi-patch"
                    | "lsass-minidump"
                    | "reverse-shell"
                    | "persistence-task"
                    | "base64-exec"
                    | "lotl-download"
                    | "bloodhound-recon"
            )
        ),
        "result_status" => matches!(
            value.as_str(),
            Some("blocked" | "mitigated" | "completed" | "failed")
        ),
        "outcome" => matches!(value.as_str(), Some("executed" | "protected" | "errored")),
        "report_status" => matches!(value.as_str(), Some("saved" | "cancelled" | "error")),
        "entry_point" => matches!(
            value.as_str(),
            Some("fix_all" | "plan_fix" | "compare_guardz")
        ),
        "destination" => value.as_str() == Some("guardz_book_a_demo"),
        "grade" => matches!(value.as_str(), Some("A" | "B" | "C" | "D" | "F")),
        "coverage_percent" => value.as_u64().is_some_and(|value| value <= 100),
        "scenario_count" | "scenario_index" | "completed_count" | "blocked_count"
        | "undetected_count" | "errored_count" => value.as_u64().is_some_and(|value| value <= 100),
        "duration_ms" => value
            .as_u64()
            .is_some_and(|value| value <= 24 * 60 * 60 * 1_000),
        _ => false,
    }
}

fn allowed_property(event_name: &str, key: &str) -> bool {
    match event_name {
        "edr_scan_started" => matches!(key, "run_id" | "scan_mode" | "scenario_count"),
        "edr_scenario_completed" => matches!(
            key,
            "run_id"
                | "scan_mode"
                | "scenario_id"
                | "scenario_index"
                | "scenario_count"
                | "result_status"
                | "outcome"
                | "duration_ms"
        ),
        "edr_scan_cancelled" => matches!(
            key,
            "run_id" | "scan_mode" | "scenario_count" | "completed_count" | "duration_ms"
        ),
        "edr_scan_completed" => matches!(
            key,
            "run_id"
                | "scan_mode"
                | "scenario_count"
                | "blocked_count"
                | "undetected_count"
                | "errored_count"
                | "coverage_percent"
                | "duration_ms"
        ),
        "edr_report_exported" => matches!(
            key,
            "run_id"
                | "report_status"
                | "scenario_count"
                | "blocked_count"
                | "undetected_count"
                | "errored_count"
                | "coverage_percent"
                | "grade"
        ),
        "edr_comparison_viewed" => matches!(
            key,
            "run_id"
                | "entry_point"
                | "scenario_count"
                | "blocked_count"
                | "undetected_count"
                | "errored_count"
                | "coverage_percent"
        ),
        "edr_demo_clicked" => matches!(
            key,
            "run_id"
                | "destination"
                | "scenario_count"
                | "blocked_count"
                | "undetected_count"
                | "errored_count"
                | "coverage_percent"
        ),
        "edr_app_first_open" | "edr_app_opened" => false,
        _ => false,
    }
}

fn posthog_event(pending: &PendingEvent) -> Result<Event, String> {
    let mut event = Event::new(pending.name.clone(), pending.distinct_id.clone());
    event
        .insert_prop("$process_person_profile", false)
        .map_err(|error| error.to_string())?;
    event.set_uuid(Uuid::parse_str(&pending.id).map_err(|error| error.to_string())?);

    let seconds = pending.occurred_at_ms.div_euclid(1_000);
    let nanos = pending.occurred_at_ms.rem_euclid(1_000) as u32 * 1_000_000;
    let timestamp = DateTime::<Utc>::from_timestamp(seconds, nanos)
        .ok_or_else(|| "Invalid analytics timestamp".to_owned())?;
    event
        .set_timestamp(timestamp)
        .map_err(|error| error.to_string())?;

    for (key, value) in &pending.properties {
        event
            .insert_prop(key.clone(), value.clone())
            .map_err(|error| error.to_string())?;
    }
    Ok(event)
}

fn load_or_create_installation_id(data_dir: &Path) -> io::Result<String> {
    let path = data_dir.join("analytics-installation-id");
    if let Ok(existing) = fs::read_to_string(&path) {
        let existing = existing.trim();
        if Uuid::parse_str(existing).is_ok() {
            return Ok(existing.to_owned());
        }
    }

    let id = Uuid::new_v4().to_string();
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    file.write_all(format!("{id}\n").as_bytes())?;
    file.sync_all()?;
    Ok(id)
}

fn write_new_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => {
            file.write_all(bytes)?;
            file.sync_all()
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error),
    }
}

fn persist_pending(outbox_dir: &Path, pending: &PendingEvent) -> io::Result<()> {
    let target = pending_path(outbox_dir, pending);
    let temporary = outbox_dir.join(format!("{}.tmp", pending.id));
    let bytes = serde_json::to_vec(pending)?;

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    fs::rename(temporary, target)
}

fn pending_path(outbox_dir: &Path, pending: &PendingEvent) -> PathBuf {
    outbox_dir.join(format!(
        "{:013}-{}.json",
        pending.occurred_at_ms, pending.id
    ))
}

fn pending_paths(outbox_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(outbox_dir)? {
        let path = entry?.path();
        if path.extension().and_then(|extension| extension.to_str()) == Some("json") {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn read_pending(outbox_dir: &Path) -> io::Result<Vec<PendingEvent>> {
    let mut events = Vec::new();
    for path in pending_paths(outbox_dir)? {
        let parsed = (|| -> io::Result<PendingEvent> {
            let bytes = fs::read(&path)?;
            let pending: PendingEvent = serde_json::from_slice(&bytes)?;
            posthog_event(&pending).map_err(io::Error::other)?;
            if pending_path(outbox_dir, &pending) != path {
                return Err(io::Error::other(
                    "Analytics event filename does not match its ID",
                ));
            }
            Ok(pending)
        })();
        match parsed {
            Ok(pending) => events.push(pending),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                eprintln!("Skipping invalid analytics outbox entry: {error}");
                if let Err(error) = fs::rename(&path, path.with_extension("invalid")) {
                    eprintln!("Could not quarantine analytics outbox entry: {error}");
                }
            }
        }
    }
    Ok(events)
}

fn analytics_environment(
    channel: Option<&str>,
    test_override: Option<&str>,
) -> (&'static str, bool) {
    let channel = match channel.map(str::trim) {
        Some("production") => "production",
        _ => "development",
    };
    let is_test = channel != "production"
        || test_override
            .is_some_and(|value| value.trim() == "1" || value.trim().eq_ignore_ascii_case("true"));
    (channel, is_test)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state(project_token: String) -> (AnalyticsState, PathBuf) {
        let data_dir = std::env::temp_dir().join(format!("edr-analytics-test-{}", Uuid::new_v4()));
        let outbox_dir = data_dir.join("analytics-outbox");
        fs::create_dir_all(&outbox_dir).unwrap();
        let state = AnalyticsState(Arc::new(AnalyticsInner {
            project_token: Some(project_token),
            host: DEFAULT_POSTHOG_HOST.to_owned(),
            release_channel: "development",
            is_test: true,
            installation_id: load_or_create_installation_id(&data_dir).unwrap(),
            session_id: Uuid::new_v4().to_string(),
            first_open_marker: data_dir.join("analytics-first-open-queued"),
            outbox_dir,
            file_lock: Mutex::new(()),
            delivery_lock: AsyncMutex::new(()),
            client: OnceCell::new(),
        }));
        (state, data_dir)
    }

    #[test]
    fn queued_events_include_surface_and_test_marker() {
        let (state, data_dir) = test_state("test-only-not-a-project-key".to_owned());
        assert!(state.queue_event(event("edr_app_opened", &[])).unwrap());
        let events = read_pending(&state.0.outbox_dir).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].properties["app_surface"], "edr_attack_simulator");
        assert_eq!(events[0].properties["is_test"], true);
        assert_eq!(events[0].properties["platform"], std::env::consts::OS);
        assert_eq!(events[0].distinct_id, state.0.installation_id);
        assert_eq!(
            load_or_create_installation_id(&data_dir).unwrap(),
            state.0.installation_id
        );
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn production_telemetry_requires_an_explicit_channel() {
        for channel in [None, Some("development"), Some("qa"), Some("")] {
            assert_eq!(analytics_environment(channel, None), ("development", true));
            assert_eq!(
                analytics_environment(channel, Some("false")),
                ("development", true)
            );
        }
        assert_eq!(
            analytics_environment(Some("production"), None),
            ("production", false)
        );
        for value in ["1", "true", "TRUE"] {
            assert_eq!(
                analytics_environment(Some("production"), Some(value)),
                ("production", true)
            );
        }
    }

    #[test]
    fn invalid_outbox_entries_do_not_hide_healthy_events() {
        let (state, data_dir) = test_state("test-only-not-a-project-key".to_owned());
        state.queue_event(event("edr_app_opened", &[])).unwrap();
        let expected = read_pending(&state.0.outbox_dir).unwrap()[0].id.clone();
        let malformed = state.0.outbox_dir.join("000-malformed.json");
        fs::write(&malformed, b"{truncated").unwrap();
        let unreadable = state.0.outbox_dir.join("001-directory.json");
        fs::create_dir(&unreadable).unwrap();
        let mut invalid = read_pending(&state.0.outbox_dir).unwrap()[0].clone();
        invalid.id = "invalid-uuid".to_owned();
        persist_pending(&state.0.outbox_dir, &invalid).unwrap();
        for _ in 0..2 {
            let events = read_pending(&state.0.outbox_dir).unwrap();
            assert_eq!(events.len(), 1);
            assert_eq!(events[0].id, expected);
        }
        assert!(malformed.with_extension("invalid").exists());
        assert!(unreadable.with_extension("invalid").exists());
        assert!(pending_path(&state.0.outbox_dir, &invalid)
            .with_extension("invalid")
            .exists());
        assert_eq!(pending_paths(&state.0.outbox_dir).unwrap().len(), 1);
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn full_outbox_still_attempts_delivery() {
        use std::io::Read;
        use std::net::TcpListener;
        use std::time::{Duration, Instant};

        let (state, data_dir) = test_state("test-only-not-a-project-key".to_owned());
        for _ in 0..MAX_OUTBOX_EVENTS {
            state.queue_event(event("edr_app_opened", &[])).unwrap();
        }
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let options = ClientOptionsBuilder::default()
            .api_key("test-only-not-a-project-key".to_owned())
            .host(format!("http://{}", listener.local_addr().unwrap()))
            .request_timeout_seconds(2)
            .max_capture_attempts(1)
            .build()
            .unwrap();
        tauri::async_runtime::block_on(async {
            assert!(state
                .0
                .client
                .set(Arc::new(posthog_rs::client(options).await))
                .is_ok());
        });
        let receiver = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(3);
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let mut buffer = [0; 4096];
                        assert!(stream.read(&mut buffer).unwrap() > 0);
                        stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                        return true;
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("Local test receiver failed: {error}"),
                }
            }
            false
        });
        assert_eq!(
            state.track(event("edr_app_opened", &[])).unwrap_err(),
            "Analytics outbox is full"
        );
        let attempted = receiver.join().unwrap();
        tauri::async_runtime::block_on(async {
            let _guard = state.0.delivery_lock.lock().await;
        });
        assert_eq!(
            read_pending(&state.0.outbox_dir).unwrap().len(),
            MAX_OUTBOX_EVENTS
        );
        fs::remove_dir_all(data_dir).unwrap();
        assert!(
            attempted,
            "A full outbox must still schedule a delivery attempt"
        );
    }

    #[test]
    #[ignore = "Sends nine synthetic events; requires POSTHOG_SMOKE_TOKEN explicitly"]
    fn live_posthog_smoke_test() {
        let token = std::env::var("POSTHOG_SMOKE_TOKEN").expect("POSTHOG_SMOKE_TOKEN is required");
        assert!(
            token.starts_with("phc_"),
            "Use a public project ingestion token"
        );
        let (state, data_dir) = test_state(token);
        let run_id = Uuid::new_v4().to_string();
        let fixtures = [
            ("edr_app_first_open", serde_json::json!({})),
            ("edr_app_opened", serde_json::json!({})),
            (
                "edr_scan_started",
                serde_json::json!({
                    "run_id": run_id, "scan_mode": "selected", "scenario_count": 1
                }),
            ),
            (
                "edr_scenario_completed",
                serde_json::json!({
                    "run_id": run_id, "scan_mode": "selected", "scenario_id": "certutil-dump",
                    "scenario_index": 1, "scenario_count": 1, "result_status": "blocked",
                    "outcome": "protected", "duration_ms": 10
                }),
            ),
            (
                "edr_scan_completed",
                serde_json::json!({
                    "run_id": run_id, "scan_mode": "selected", "scenario_count": 1,
                    "blocked_count": 1, "undetected_count": 0, "errored_count": 0,
                    "coverage_percent": 100, "duration_ms": 10
                }),
            ),
            (
                "edr_report_exported",
                serde_json::json!({
                    "run_id": run_id, "report_status": "saved", "scenario_count": 1,
                    "blocked_count": 1, "undetected_count": 0, "errored_count": 0,
                    "coverage_percent": 100, "grade": "A"
                }),
            ),
            (
                "edr_comparison_viewed",
                serde_json::json!({
                    "run_id": run_id, "entry_point": "compare_guardz", "scenario_count": 1,
                    "blocked_count": 1, "undetected_count": 0, "errored_count": 0,
                    "coverage_percent": 100
                }),
            ),
            (
                "edr_demo_clicked",
                serde_json::json!({
                    "run_id": run_id, "destination": "guardz_book_a_demo", "scenario_count": 1,
                    "blocked_count": 1, "undetected_count": 0, "errored_count": 0,
                    "coverage_percent": 100
                }),
            ),
            (
                "edr_scan_cancelled",
                serde_json::json!({
                    "run_id": Uuid::new_v4().to_string(), "scan_mode": "selected",
                    "scenario_count": 1, "completed_count": 0, "duration_ms": 1
                }),
            ),
        ];
        for (name, properties) in fixtures {
            assert!(state
                .queue_event(AnalyticsEvent {
                    name: name.to_owned(),
                    properties: serde_json::from_value(properties).unwrap(),
                })
                .unwrap());
        }
        assert_eq!(read_pending(&state.0.outbox_dir).unwrap().len(), 9);
        tauri::async_runtime::block_on(state.flush_pending());
        assert!(
            read_pending(&state.0.outbox_dir).unwrap().is_empty(),
            "Delivery incomplete; outbox retained"
        );
        println!(
            "Submitted 9 is_test=true events; distinct_id={}",
            state.0.installation_id
        );
        fs::remove_dir_all(data_dir).unwrap();
    }

    fn event(name: &str, properties: &[(&str, Value)]) -> AnalyticsEvent {
        AnalyticsEvent {
            name: name.to_owned(),
            properties: properties
                .iter()
                .map(|(key, value)| ((*key).to_owned(), value.clone()))
                .collect(),
        }
    }

    #[test]
    fn accepts_allowlisted_scalar_properties() {
        let input = event(
            "edr_scan_started",
            &[
                ("run_id", Value::String(Uuid::new_v4().to_string())),
                ("scan_mode", Value::String("full".to_owned())),
                ("scenario_count", Value::from(9)),
            ],
        );

        assert!(validate_event(&input).is_ok());
    }

    #[test]
    fn rejects_unknown_events_and_properties() {
        assert!(validate_event(&event("arbitrary_event", &[])).is_err());
        assert!(validate_event(&event(
            "edr_scan_started",
            &[("hostname", Value::String("private-device".to_owned()))],
        ))
        .is_err());
    }

    #[test]
    fn rejects_nested_or_long_values() {
        assert!(validate_event(&event(
            "edr_scan_started",
            &[("scan_mode", serde_json::json!({ "nested": true }))],
        ))
        .is_err());
        assert!(validate_event(&event(
            "edr_scan_started",
            &[("scan_mode", Value::String("x".repeat(129)))],
        ))
        .is_err());
    }

    #[test]
    fn rejects_private_or_out_of_range_values_in_allowed_fields() {
        assert!(validate_event(&event(
            "edr_scan_started",
            &[("scan_mode", Value::String("private-device-name".to_owned()))],
        ))
        .is_err());
        assert!(validate_event(&event(
            "edr_scan_completed",
            &[("coverage_percent", Value::from(101))],
        ))
        .is_err());
    }

    #[test]
    fn pending_events_round_trip_as_individual_files() {
        let dir = std::env::temp_dir().join(format!("edr-analytics-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let pending = PendingEvent {
            id: Uuid::new_v4().to_string(),
            name: "edr_app_opened".to_owned(),
            distinct_id: Uuid::new_v4().to_string(),
            occurred_at_ms: 1_700_000_000_000,
            properties: BTreeMap::new(),
        };

        persist_pending(&dir, &pending).unwrap();
        let stored = read_pending(&dir).unwrap();

        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, pending.id);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn posthog_events_are_personless_and_keep_the_installation_id() {
        let installation_id = Uuid::new_v4().to_string();
        let pending = PendingEvent {
            id: Uuid::new_v4().to_string(),
            name: "edr_app_opened".to_owned(),
            distinct_id: installation_id.clone(),
            occurred_at_ms: 1_700_000_000_000,
            properties: BTreeMap::new(),
        };

        let event = posthog_event(&pending).unwrap();
        assert_eq!(event.distinct_id(), installation_id);
        let encoded = serde_json::to_value(event).unwrap();

        assert_eq!(encoded["properties"]["$process_person_profile"], false);
    }
}
