import { ReactNode, useState } from "react";
import { motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome, GRADE_TONE, type Grade } from "../utils/verdict";
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

function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

/**
 * A short, factual read-out of what the run actually did. The rail's verdict
 * line carries the exposure framing; this carries the composition of the run.
 */
function runSummary(
  total: number,
  blocked: number,
  bypassed: number,
  errored: number,
): string {
  if (total === 0) return "No attacks were run against this endpoint.";
  const noun = total === 1 ? "attack" : "attacks";
  const head = `${total} ${noun} run against ${TARGET_HOST}.`;
  if (blocked + bypassed === 0) {
    return `${head} None could be started, so coverage is unknown.`;
  }
  const body =
    bypassed === 0
      ? ` All ${blocked} were blocked.`
      : ` ${blocked} blocked, ${bypassed} bypassed protection.`;
  const tail = errored > 0 ? ` ${errored} never started.` : "";
  return head + body + tail;
}

/** The rail sets these on two lines, so the verdict comes back split. */
function summaryFor(score: number, gaps: number): [string, string] {
  if (gaps === 0) return ["Full coverage.", "Every attack was blocked."];
  const tail = `${gaps} attack${gaps > 1 ? "s" : ""} bypassed protection.`;
  if (score >= 80) return ["Limited exposure.", tail];
  if (score >= 65) return ["Moderate exposure.", tail];
  return ["High exposure.", tail];
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "safe" | "danger";
}) {
  return (
    <motion.div
      variants={listItem}
      style={{ backgroundImage: "var(--gradient-stat)" }}
      className="flex flex-1 flex-col gap-2 rounded-[18px] border border-[#A289FC66] bg-origin-border px-4.5 py-4"
    >
      <p
        className={`text-[14px] leading-[18px] ${
          tone === "danger"
            ? "font-semibold text-guardz-pink"
            : "font-medium text-text-dim"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-display text-[32px] leading-8 font-bold ${
          tone === "danger"
            ? "text-guardz-pink"
            : tone === "safe"
              ? "text-brand-green"
              : "text-white"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}

export default function ResultsScreen({
  scenarios,
  runQueue,
  runId,
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
  /* Attacks that never started say nothing about coverage, so they are kept
     out of the score rather than counted as blocked. */
  const tested = blockedCount + undetected.length;
  const erroredCount = total - tested;
  const coverage = tested > 0 ? Math.round((blockedCount / tested) * 100) : 0;

  const animatedScore = useCountUp(coverage);
  const animatedBlocked = useCountUp(blockedCount);
  const animatedUndetected = useCountUp(undetected.length);

  const grade = gradeFor(coverage);
  const [headline, detail] = summaryFor(coverage, undetected.length);

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
      summary: `${headline} ${detail}`,
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
      heading={
        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-2">
            <h1 className="text-report-title text-white">
              Attack Readiness Report
            </h1>
            <p className="text-[15px] leading-[22px] text-[#FFFFFFBF]">
              {runSummary(
                total,
                blockedCount,
                undetected.length,
                total - tested,
              )}
            </p>
          </div>

          <div className="flex items-center gap-5">
            <GradeRing
              score={coverage}
              grade={grade}
              color={GRADE_TONE[grade]}
              size={96}
            />
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-[28px] leading-7 font-bold">
                <span style={{ color: GRADE_TONE[grade] }}>
                  {animatedScore}
                </span>
                <span className="text-white">/100</span>
              </span>
              <p className="text-[15px] leading-5 font-semibold text-white">
                {headline}
              </p>
            </div>
          </div>
        </div>
      }
      action={
        <div className="flex flex-col gap-[11px]">
          <button
            onClick={handleDownload}
            disabled={saveState === "working"}
            className="btn btn-light w-full gap-[9px] p-[13px] text-[15px] leading-5"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
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
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-9 py-6.5">
        <h2 className="text-section-title shrink-0 text-white">
          What we found
        </h2>

        <motion.div
          variants={listContainer}
          initial="initial"
          animate="animate"
          className="flex shrink-0 gap-3.5"
        >
          <StatTile label="Blocked" value={animatedBlocked} tone="safe" />
          <StatTile
            label="Undetected"
            value={animatedUndetected}
            tone="danger"
          />
          <StatTile label="Detection Coverage" value={`${animatedScore}%`} />
        </motion.div>

        <h3 className="text-subsection-title mt-0.5 shrink-0 text-white">
          Recommended actions
        </h3>

        <motion.div
          variants={listContainer}
          initial="initial"
          animate="animate"
          className="scrollbar-none flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto"
        >
          {undetected.length === 0 ? (
            <motion.p
              variants={listItem}
              style={{ backgroundImage: "var(--gradient-rec)" }}
              className="rounded-[18px] border border-[#A289FC59] px-[18px] py-6 text-center text-[16px] leading-6 text-text-soft"
            >
              Every attack in this run was blocked. No remediation needed.
            </motion.p>
          ) : (
            undetected.map((scenario) => (
              <RecommendationCard
                key={scenario.id}
                scenario={scenario}
                recommendation={getRecommendation(scenario.id)}
              />
            ))
          )}
        </motion.div>

        <div
          className="mt-auto flex h-[125px] shrink-0 items-center gap-4 rounded-[18px] border border-[#A289FC66] bg-origin-border px-5 py-[15px]"
          style={{ backgroundImage: "var(--gradient-band)" }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[28px] leading-[34px] font-bold tracking-[0.5px] text-white">
              See how Guardz compares
            </p>
            <p className="text-[18px] leading-[22px] tracking-[0.5px] text-text-dim">
              Guardz blocked all {total} of these attacks in the same
              simulation.
            </p>
          </div>

          <button
            onClick={() => onCompare("compare_guardz")}
            className="btn btn-primary shrink-0 gap-2 px-5 py-[11px] text-[16px] leading-5"
          >
            Learn more
          </button>
        </div>
      </div>
    </RailLayout>
  );
}
