import { useEffect, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppPhase, ExecutionResult, Scenario } from "../types";
import { DEFAULT_SELECTED_IDS, INITIAL_SCENARIOS } from "../data/scenarios";
import { executeScenario } from "../lib/executor";
import {
  ComparisonEntryPoint,
  ScanMode,
  trackEvent,
} from "../lib/analytics";
import { stepTransition } from "../lib/motion";
import { getOutcome } from "../utils/verdict";
import WelcomeScreen from "./WelcomeScreen";
import SelectionScreen from "./SelectionScreen";
import ExecutionView from "./ExecutionView";
import ResultsScreen from "./ResultsScreen";
import CompareScreen from "./CompareScreen";

interface AppState {
  phase: AppPhase;
  scenarios: Scenario[];
  selectedIds: string[];
  currentIndex: number;
  runQueue: string[];
}

type Action =
  | { type: "START_FULL_SCAN" }
  | { type: "GO_TO_SELECT" }
  | { type: "TOGGLE_SELECTION"; id: string }
  | { type: "TOGGLE_ALL" }
  | { type: "START_SELECTED" }
  | { type: "SCENARIO_EXECUTING"; id: string }
  | { type: "SCENARIO_COMPLETE"; id: string; result: ExecutionResult }
  | { type: "ADVANCE_NEXT" }
  | { type: "SHOW_RESULTS" }
  | { type: "SHOW_COMPARE" }
  | { type: "RERUN" }
  | { type: "RESET" };

const initialState: AppState = {
  phase: "welcome",
  scenarios: INITIAL_SCENARIOS,
  selectedIds: DEFAULT_SELECTED_IDS,
  currentIndex: 0,
  runQueue: [],
};

/** Every run starts from a clean set of statuses. */
function freshScenarios(): Scenario[] {
  return INITIAL_SCENARIOS.map((s) => ({ ...s, status: "ready" as const }));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "START_FULL_SCAN":
      return {
        ...state,
        phase: "executing",
        scenarios: freshScenarios(),
        currentIndex: 0,
        runQueue: INITIAL_SCENARIOS.map((s) => s.id),
      };

    case "GO_TO_SELECT":
      return { ...state, phase: "selecting" };

    case "TOGGLE_SELECTION": {
      const exists = state.selectedIds.includes(action.id);
      return {
        ...state,
        selectedIds: exists
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      };
    }

    case "TOGGLE_ALL":
      return {
        ...state,
        selectedIds:
          state.selectedIds.length === state.scenarios.length
            ? []
            : state.scenarios.map((s) => s.id),
      };

    case "START_SELECTED":
      return {
        ...state,
        phase: "executing",
        scenarios: freshScenarios(),
        currentIndex: 0,
        runQueue: INITIAL_SCENARIOS.filter((s) =>
          state.selectedIds.includes(s.id),
        ).map((s) => s.id),
      };

    case "SCENARIO_EXECUTING":
      return {
        ...state,
        scenarios: state.scenarios.map((s) =>
          s.id === action.id ? { ...s, status: "executing" as const } : s,
        ),
      };

    case "SCENARIO_COMPLETE":
      return {
        ...state,
        scenarios: state.scenarios.map((s) =>
          s.id === action.id
            ? {
                ...s,
                status: action.result.status as Scenario["status"],
                message: action.result.message,
                stdout: action.result.stdout,
                stderr: action.result.stderr,
                exitCode: action.result.exitCode,
                durationMs: action.result.durationMs,
              }
            : s,
        ),
      };

    case "ADVANCE_NEXT":
      return { ...state, currentIndex: state.currentIndex + 1 };

    case "SHOW_RESULTS":
      return { ...state, phase: "results" };

    case "SHOW_COMPARE":
      return { ...state, phase: "compare" };

    case "RERUN":
      return {
        ...state,
        phase: "executing",
        scenarios: freshScenarios(),
        currentIndex: 0,
      };

    case "RESET":
      return { ...initialState, selectedIds: state.selectedIds };

    default:
      return state;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long a verdict stays on screen before advancing. */
const VERDICT_DWELL_MS = 1400;

interface RunTelemetry {
  runId: string;
  mode: ScanMode;
  startedAt: number;
  scenarioCount: number;
  completedCount: number;
  blockedCount: number;
  undetectedCount: number;
  erroredCount: number;
  coveragePercent: number;
}

function createRunTelemetry(mode: ScanMode, scenarioCount: number): RunTelemetry {
  return {
    runId: crypto.randomUUID(),
    mode,
    startedAt: Date.now(),
    scenarioCount,
    completedCount: 0,
    blockedCount: 0,
    undetectedCount: 0,
    erroredCount: 0,
    coveragePercent: 0,
  };
}

export default function AppShell() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const runIdRef = useRef(0);
  const activeRunRef = useRef<RunTelemetry | null>(null);
  const lastRunRef = useRef<RunTelemetry | null>(null);

  function startRun(mode: ScanMode, scenarioCount: number, action: Action) {
    const run = createRunTelemetry(mode, scenarioCount);
    activeRunRef.current = run;
    trackEvent("edr_scan_started", {
      run_id: run.runId,
      scan_mode: mode,
      scenario_count: scenarioCount,
    });
    dispatch(action);
  }

  useEffect(() => {
    if (state.phase !== "executing" || state.runQueue.length === 0) return;

    const runId = ++runIdRef.current;
    let cancelled = false;
    const alive = () => !cancelled && runIdRef.current === runId;

    (async () => {
      for (let i = 0; i < state.runQueue.length; i++) {
        if (!alive()) return;

        const scenarioId = state.runQueue[i];
        dispatch({ type: "SCENARIO_EXECUTING", id: scenarioId });

        const result = await executeScenario(scenarioId);
        if (!alive()) return;

        dispatch({ type: "SCENARIO_COMPLETE", id: scenarioId, result });

        const run = activeRunRef.current;
        if (run) {
          const outcome = getOutcome(result.status);
          run.completedCount += 1;
          if (outcome === "protected") run.blockedCount += 1;
          if (outcome === "executed") run.undetectedCount += 1;
          if (outcome === "errored") run.erroredCount += 1;
          trackEvent("edr_scenario_completed", {
            run_id: run.runId,
            scan_mode: run.mode,
            scenario_id: scenarioId,
            scenario_index: i + 1,
            scenario_count: run.scenarioCount,
            result_status: result.status,
            outcome,
            duration_ms: result.durationMs,
          });
        }

        await sleep(VERDICT_DWELL_MS);
        if (!alive()) return;

        if (i < state.runQueue.length - 1) {
          dispatch({ type: "ADVANCE_NEXT" });
        }
      }

      if (alive()) {
        const run = activeRunRef.current;
        if (run) {
          const tested = run.blockedCount + run.undetectedCount;
          run.coveragePercent =
            tested > 0 ? Math.round((run.blockedCount / tested) * 100) : 0;
          trackEvent("edr_scan_completed", {
            run_id: run.runId,
            scan_mode: run.mode,
            scenario_count: run.scenarioCount,
            blocked_count: run.blockedCount,
            undetected_count: run.undetectedCount,
            errored_count: run.erroredCount,
            coverage_percent: run.coveragePercent,
            duration_ms: Date.now() - run.startedAt,
          });
          lastRunRef.current = { ...run };
          activeRunRef.current = null;
        }
        dispatch({ type: "SHOW_RESULTS" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.runQueue]);

  function cancelRun() {
    const run = activeRunRef.current;
    if (run) {
      trackEvent("edr_scan_cancelled", {
        run_id: run.runId,
        scan_mode: run.mode,
        scenario_count: run.scenarioCount,
        completed_count: run.completedCount,
        duration_ms: Date.now() - run.startedAt,
      });
      activeRunRef.current = null;
    }
    runIdRef.current += 1;
    dispatch({ type: "RESET" });
  }

  function showComparison(entryPoint: ComparisonEntryPoint) {
    const run = lastRunRef.current;
    if (run) {
      trackEvent("edr_comparison_viewed", {
        run_id: run.runId,
        entry_point: entryPoint,
        scenario_count: run.scenarioCount,
        blocked_count: run.blockedCount,
        undetected_count: run.undetectedCount,
        errored_count: run.erroredCount,
        coverage_percent: run.coveragePercent,
      });
    }
    dispatch({ type: "SHOW_COMPARE" });
  }

  function renderPhase() {
    switch (state.phase) {
      case "welcome":
        return (
          <WelcomeScreen
            onRunAll={() =>
              startRun("full", INITIAL_SCENARIOS.length, {
                type: "START_FULL_SCAN",
              })
            }
            onSelectIndividual={() => dispatch({ type: "GO_TO_SELECT" })}
          />
        );

      case "selecting":
        return (
          <SelectionScreen
            scenarios={state.scenarios}
            selectedIds={state.selectedIds}
            onToggle={(id) => dispatch({ type: "TOGGLE_SELECTION", id })}
            onRunSelected={() =>
              startRun("selected", state.selectedIds.length, {
                type: "START_SELECTED",
              })
            }
            onBack={() => dispatch({ type: "RESET" })}
          />
        );

      case "executing":
        return (
          <ExecutionView
            scenarios={state.scenarios}
            runQueue={state.runQueue}
            currentIndex={state.currentIndex}
            onCancel={cancelRun}
          />
        );

      case "results":
        return (
          <ResultsScreen
            scenarios={state.scenarios}
            runQueue={state.runQueue}
            runId={lastRunRef.current?.runId ?? null}
            onRunAgain={() =>
              startRun("rerun", state.runQueue.length, { type: "RERUN" })
            }
            onCompare={showComparison}
          />
        );

      case "compare":
        return (
          <CompareScreen
            scenarios={state.scenarios}
            runQueue={state.runQueue}
            runId={lastRunRef.current?.runId ?? null}
            onBack={() => dispatch({ type: "SHOW_RESULTS" })}
          />
        );
    }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state.phase}
        variants={stepTransition}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full"
      >
        {renderPhase()}
      </motion.div>
    </AnimatePresence>
  );
}
