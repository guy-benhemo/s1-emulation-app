import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome, isSettled } from "../utils/verdict";
import { TARGET_HOST } from "../data/scenarios";
import { EASE_OUT } from "../lib/motion";
import RailLayout from "./RailLayout";
import RailStatCard from "./RailStatCard";
import StepperBar from "./StepperBar";
import ScanningCard from "./ScanningCard";
import VerdictCard from "./VerdictCard";
import CompletedChips from "./CompletedChips";

interface ExecutionViewProps {
  scenarios: Scenario[];
  runQueue: string[];
  currentIndex: number;
  onCancel: () => void;
}

function useElapsed() {
  const startRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const total = Math.floor((now - startRef.current) / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function ExecutionView({
  scenarios,
  runQueue,
  currentIndex,
  onCancel,
}: ExecutionViewProps) {
  const elapsed = useElapsed();

  const queued = runQueue.map((id) => scenarios.find((s) => s.id === id)!);
  const currentScenario = queued[currentIndex];
  const completed = queued.filter((s) => s && isSettled(s.status));
  const blockedCount = completed.filter(
    (s) => getOutcome(s.status) === "protected",
  ).length;
  const undetectedCount = completed.filter(
    (s) => getOutcome(s.status) === "executed",
  ).length;
  const erroredCount = completed.filter(
    (s) => getOutcome(s.status) === "errored",
  ).length;

  const stepNumber = Math.min(currentIndex + 1, runQueue.length);
  const pct =
    runQueue.length > 0 ? (completed.length / runQueue.length) * 100 : 0;

  const isVerdict = currentScenario && isSettled(currentScenario.status);

  return (
    <RailLayout
      heading={
        <div className="flex flex-col gap-4">
          <h1 className="text-rail-title text-white">
            Simulating attacks on your endpoint
          </h1>
          <p className="text-[15px] leading-[23px] text-[#FFFFFFBF]">
            Each attack runs safely against {TARGET_HOST} and reverts itself.
            Watch how your defenses respond in real time.
          </p>
        </div>
      }
      bottom={
        <RailStatCard
          label="Progress"
          value={`Test ${stepNumber} of ${runQueue.length}`}
          percent={pct}
          footer={
            <div className="flex items-center gap-3.5 text-[12px] leading-4 text-[#FFFFFFB8]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.75 w-1.75 shrink-0 rounded-full bg-brand-green" />
                {blockedCount} Blocked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.75 w-1.75 shrink-0 rounded-full bg-guardz-pink" />
                {undetectedCount} Undetected
              </span>
              {erroredCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.75 w-1.75 shrink-0 rounded-full bg-white/50" />
                  {erroredCount} Didn&rsquo;t run
                </span>
              )}
            </div>
          }
        />
      }
      action={
        <button
          onClick={onCancel}
          className="inline-flex cursor-pointer items-center gap-2 text-[13px] leading-4 font-medium text-[#FFFFFFB3] transition-colors hover:text-white"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(255 255 255 / 60%)"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <line x1="9" y1="9" x2="15" y2="15" />
            <line x1="15" y1="9" x2="9" y2="15" />
          </svg>
          Cancel simulation
        </button>
      }
    >
      <header className="flex shrink-0 items-center justify-between px-10 pt-6 pb-[18px]">
        <span className="font-mono text-[13px] leading-4 font-semibold text-guardz-lavender">
          {elapsed} elapsed
        </span>
      </header>

      <div className="shrink-0 px-10 pb-1">
        <StepperBar scenarios={scenarios} runQueue={runQueue} />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-10 py-5">
        <AnimatePresence mode="wait">
          {currentScenario && (
            <motion.div
              key={`${currentScenario.id}-${isVerdict ? "verdict" : "scanning"}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="flex w-full justify-center"
            >
              {isVerdict ? (
                <VerdictCard scenario={currentScenario} />
              ) : (
                <ScanningCard scenario={currentScenario} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CompletedChips completed={completed} />
    </RailLayout>
  );
}
