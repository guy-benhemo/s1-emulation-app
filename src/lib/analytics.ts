import { invoke } from "@tauri-apps/api/core";

export type ScanMode = "full" | "selected" | "rerun";
export type ComparisonEntryPoint = "fix_all" | "plan_fix" | "compare_guardz";

interface AnalyticsEventMap {
  edr_scan_started: {
    run_id: string;
    scan_mode: ScanMode;
    scenario_count: number;
  };
  edr_scenario_completed: {
    run_id: string;
    scan_mode: ScanMode;
    scenario_id: string;
    scenario_index: number;
    scenario_count: number;
    result_status: "blocked" | "mitigated" | "completed" | "failed";
    outcome: "executed" | "protected" | "errored";
    duration_ms: number;
  };
  edr_scan_cancelled: {
    run_id: string;
    scan_mode: ScanMode;
    scenario_count: number;
    completed_count: number;
    duration_ms: number;
  };
  edr_scan_completed: {
    run_id: string;
    scan_mode: ScanMode;
    scenario_count: number;
    blocked_count: number;
    undetected_count: number;
    errored_count: number;
    coverage_percent: number;
    duration_ms: number;
  };
  edr_report_exported: {
    run_id: string;
    report_status: "saved" | "cancelled" | "error";
    scenario_count: number;
    blocked_count: number;
    undetected_count: number;
    errored_count: number;
    coverage_percent: number;
    grade: string;
  };
  edr_comparison_viewed: {
    run_id: string;
    entry_point: ComparisonEntryPoint;
    scenario_count: number;
    blocked_count: number;
    undetected_count: number;
    errored_count: number;
    coverage_percent: number;
  };
  edr_demo_clicked: {
    run_id: string;
    destination: "guardz_book_a_demo";
    scenario_count: number;
    blocked_count: number;
    undetected_count: number;
    errored_count: number;
    coverage_percent: number;
  };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The native command validates every name and property before it writes to the
 * durable outbox. Tracking never blocks or changes the user flow.
 */
export function trackEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  properties: AnalyticsEventMap[Name],
): void {
  if (!isTauri()) return;

  void invoke("track_event", {
    event: { name, properties },
  }).catch(() => {
    // Analytics must never interrupt a simulation or expose telemetry errors.
  });
}
