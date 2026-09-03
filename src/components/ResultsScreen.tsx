import { ReactNode, useState } from "react";
import { motion } from "motion/react";
import { Scenario, Severity } from "../types";
import { getOutcome } from "../utils/verdict";
import { getRecommendation } from "../data/recommendations";
import { TARGET_HOST } from "../data/scenarios";
import { saveReportPdf } from "../lib/savePdf";
import {
  ComparisonEntryPoint,
  trackEvent,
} from "../lib/analytics";
import { useCountUp } from "../lib/useCountUp";
import { listContainer, listItem } from "../lib/motion";
import RailLayout from "./RailLayout";
import GradeRing from "./GradeRing";
import RecommendationCard from "./RecommendationCard";

interface ResultsScreenProps {
  scenarios: Scenario[];
  runQueue: string[];
  runId: string | null;
  onRunAgain: () => void;
  onCompare: (entryPoint: ComparisonEntryPoint) => void;
}

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function summaryFor(score: number, gaps: number): string {
  if (gaps === 0) return "Full coverage. Every attack was blocked.";
  const tail = `${gaps} attack${gaps > 1 ? "s" : ""} bypassed protection.`;
  if (score >= 80) return `Limited exposure. ${tail}`;
  if (score >= 65) return `Moderate exposure. ${tail}`;
  return `High exposure. ${tail}`;
}

const SEVERITY_RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };

/** A factual recap of this run — every number comes from the results. */
function buildRailSummary(
  total: number,
  blocked: number,
  undetected: Scenario[],
  errored: number,
): string {
  const parts = [
    `${total} ${total === 1 ? "attack" : "attacks"} simulated against ${TARGET_HOST}.`,
    `${blocked} blocked, ${undetected.length} undetected${
      errored > 0 ? `, ${errored} could not run` : ""
    }.`,
  ];

  if (undetected.length === 0) {
    parts.push("No remediation required.");
  } else {
    const worst = [...undetected]
      .map((s) => ({ s, rec: getRecommendation(s.id) }))
      .sort(
        (a, b) => SEVERITY_RANK[b.rec.severity] - SEVERITY_RANK[a.rec.severity],
      )[0];
    parts.push(
      `Highest risk: ${worst.s.name} (${worst.rec.severity.toLowerCase()} severity).`,
    );
  }

  return parts.join(" ");
}

function StatTile({
  label,
  value,
  tone = "default",
  suffix,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "danger";
  suffix?: ReactNode;
}) {
  return (
    <motion.div
      variants={listItem}
      className="rounded-[14px] border border-white/8 bg-white/[0.02] px-5 py-4"
    >
      <p className="text-[14px] text-guardz-light-gray">{label}</p>
      <p className="mt-1 flex items-baseline gap-2.5">
        <span
          className={`font-display text-[34px] leading-[42px] font-bold ${
            tone === "danger" ? "text-guardz-pink" : "text-white"
          }`}
        >
          {value}
        </span>
        {suffix}
      </p>
    </motion.div>
  );
}

export default function ResultsScreen({
  scenarios,
  runQueue,
  runId,
  onRunAgain,
  onCompare,
}: ResultsScreenProps) {
  const ran = runQueue
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s): s is Scenario => Boolean(s));

  const total = ran.length;
  const undetected = ran.filter((s) => getOutcome(s.status) === "executed");
  const blockedCount = ran.filter(
    (s) => getOutcome(s.status) === "protected",
  ).length;
  const erroredCount = ran.filter(
    (s) => getOutcome(s.status) === "errored",
  ).length;
  /* Attacks that never started say nothing about coverage, so they are kept
     out of the score rather than counted as blocked. */
  const tested = blockedCount + undetected.length;
  const coverage = tested > 0 ? Math.round((blockedCount / tested) * 100) : 0;

  const animatedScore = useCountUp(coverage);
  const animatedBlocked = useCountUp(blockedCount);
  const animatedUndetected = useCountUp(undetected.length);

  const grade = gradeFor(coverage);
  const summary = summaryFor(coverage, undetected.length);
  const railSummary = buildRailSummary(
    total,
    blockedCount,
    undetected,
    erroredCount,
  );

  const [saveState, setSaveState] = useState<
    "idle" | "working" | "saved" | "error"
  >("idle");
  const [saveNote, setSaveNote] = useState<string | null>(null);

  async function handleDownload() {
    setSaveState("working");
    setSaveNote(null);

    const result = await saveReportPdf({
      scenarios,
      runQueue,
      coverage,
      grade,
      summary,
    });

    if (runId) {
      trackEvent("edr_report_exported", {
        run_id: runId,
        report_status: result.status,
        scenario_count: total,
        blocked_count: blockedCount,
        undetected_count: undetected.length,
        errored_count: erroredCount,
        coverage_percent: coverage,
        grade,
      });
    }

    if (result.status === "saved") {
      setSaveState("saved");
      setSaveNote(result.path ?? null);
      window.setTimeout(() => setSaveState("idle"), 2600);
    } else if (result.status === "cancelled") {
      setSaveState("idle");
    } else {
      setSaveState("error");
      setSaveNote(result.message);
    }
  }

  const downloadLabel =
    saveState === "working"
      ? "Preparing report…"
      : saveState === "saved"
        ? "Report saved"
        : "Download PDF report";

  return (
    <RailLayout
      title="Attack Readiness Report"
      eyebrow="Summary"
      subtitle={railSummary}
      railMiddle={
        <div className="mt-14 flex items-center gap-6">
          <GradeRing score={coverage} grade={grade} />
          <div className="flex flex-col">
            <span className="font-display text-[30px] leading-none font-light text-white/90">
              {animatedScore}/100
            </span>
            <p className="mt-2.5 max-w-[180px] text-[15px] leading-[22px] text-white/75">
              {summary}
            </p>
          </div>
        </div>
      }
      railAction={
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownload}
            disabled={saveState === "working"}
            className="btn btn-light w-full gap-[9px] p-[13px] text-[14px] leading-[18px]"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {downloadLabel}
          </button>

          {saveState === "saved" && saveNote && (
            <p
              className="truncate text-[12px] leading-4 text-white/60"
              title={saveNote}
            >
              Saved to {saveNote}
            </p>
          )}

          {saveState === "error" && saveNote && (
            <p className="text-[12px] leading-4 text-white/70">
              Could not save: {saveNote}
            </p>
          )}
        </div>
      }
    >
      <header className="flex shrink-0 items-center justify-between px-[34px] pt-7 pb-5">
        <h2 className="text-section-title text-white">What we found</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={onRunAgain}
            className="btn btn-secondary gap-2 px-4 py-[9px] text-[13px] leading-4"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Re-run
          </button>
          <button
            onClick={() => onCompare("fix_all")}
            className="btn btn-primary gap-2 px-5 py-[11px] text-[14px] leading-[18px]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            Fix all {undetected.length} gaps
          </button>
        </div>
      </header>

      <motion.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        className="grid shrink-0 grid-cols-3 gap-4 px-[34px]"
      >
        <StatTile label="Blocked" value={animatedBlocked} />
        <StatTile label="Undetected" value={animatedUndetected} tone="danger" />
        <StatTile
          label="Detection Coverage"
          value={`${animatedScore}%`}
          suffix={
            erroredCount > 0 ? (
              <span className="text-[13px] text-guardz-light-gray">
                {erroredCount} didn&rsquo;t run
              </span>
            ) : undefined
          }
        />
      </motion.div>

      <h3 className="text-subsection-title shrink-0 px-[34px] pt-7 pb-4 text-white">
        Recommended actions
      </h3>

      <motion.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        className="scrollbar-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[34px] pb-5"
      >
        {undetected.length === 0 ? (
          <motion.p
            variants={listItem}
            className="rounded-[14px] border border-guardz-light-purple/20 bg-guardz-purple/[0.08] px-5 py-6 text-center text-[15px] text-guardz-light-gray"
          >
            Every attack in this run was blocked. No remediation needed.
          </motion.p>
        ) : (
          undetected.map((scenario) => (
            <RecommendationCard
              key={scenario.id}
              scenario={scenario}
              recommendation={getRecommendation(scenario.id)}
              onPlanFix={() => onCompare("plan_fix")}
            />
          ))
        )}
      </motion.div>

      <div className="shrink-0 px-[34px] pb-7">
        <div className="flex items-center gap-4 rounded-[14px] border border-guardz-light-purple/25 bg-guardz-purple/[0.10] px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-guardz-purple/35">
            <svg
              className="h-5 w-5 text-guardz-bright-purple"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-white">
              See how Guardz compares
            </p>
            <p className="mt-0.5 text-[14px] text-guardz-light-gray">
              Guardz blocked all {total} of these attacks in the same
              simulation.
            </p>
          </div>
          <button
            onClick={() => onCompare("compare_guardz")}
            className="btn btn-secondary shrink-0 px-[18px] py-2.5 text-[13px] leading-4"
          >
            Compare with Guardz
          </button>
        </div>
      </div>
    </RailLayout>
  );
}
