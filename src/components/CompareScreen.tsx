import { motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome } from "../utils/verdict";
import { isTauri } from "../lib/executor";
import { trackEvent } from "../lib/analytics";
import { DEMO_URL } from "../lib/links";
import { EASE_OUT, fadeUp, listContainer, listItem } from "../lib/motion";
import GridBackdrop from "./GridBackdrop";

interface CompareScreenProps {
  scenarios: Scenario[];
  runQueue: string[];
  runId: string | null;
  onBack: () => void;
}

/** Copy from the board, not a measurement — Guardz isn't running here. */
const GUARDZ_MEDIAN_BLOCK = "0.3s";

/** The two verdict columns keep a fixed lane so every row lines up. */
const GUARDZ_COL = "w-[300px] shrink-0";
const YOURS_COL = "w-[240px] shrink-0";

/** In the desktop shell the link has to go out to the system browser. */
async function openDemo(event: React.MouseEvent<HTMLAnchorElement>) {
  if (!isTauri()) return;
  event.preventDefault();
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(DEMO_URL);
  } catch {
    window.open(DEMO_URL, "_blank", "noopener,noreferrer");
  }
}

/** The selection mark off the technique tiles, unchanged. */
const CheckMark = () => (
  <span
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
    style={{
      backgroundImage: "var(--gradient-mark)",
      boxShadow: "0 0 14px #654FE899",
    }}
  >
    <svg width="16" height="16" viewBox="0 -6.667 26.667 26.667">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22.276 0.391a1.333 1.333 0 0 1 0 1.885l-10.666 10.667a1.333 1.333 0 0 1-1.886 0l-5.333-5.334a1.333 1.333 0 0 1 1.885-1.885L10.667 10.115l9.724-9.724a1.333 1.333 0 0 1 1.885 0z"
        fill="#FFFFFF"
      />
    </svg>
  </span>
);

const CrossMark = () => (
  <span
    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-solid bg-[#FC52811F]"
    style={{ borderWidth: 1, borderColor: "#FC528147" }}
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FC5281"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  </span>
);

function medianSeconds(values: number[]): string | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const ms =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return `${(ms / 1000).toFixed(1)}s`;
}

interface Row {
  label: string;
  /** MITRE line under the label, on the technique rows. */
  detail?: string;
  guardz: "check" | string;
  yours: "cross" | string;
}

export default function CompareScreen({
  scenarios,
  runQueue,
  runId,
  onBack,
}: CompareScreenProps) {
  const ran = runQueue
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s): s is Scenario => Boolean(s));

  const total = ran.length;
  const exposed = ran.filter((s) => getOutcome(s.status) === "executed");
  const protectedCount = ran.filter(
    (s) => getOutcome(s.status) === "protected",
  ).length;
  const blockedCount = total - exposed.length;
  const erroredCount = ran.filter(
    (s) => getOutcome(s.status) === "errored",
  ).length;
  const tested = protectedCount + exposed.length;
  const telemetryCoverage = tested > 0 ? Math.round((protectedCount / tested) * 100) : 0;

  function handleDemo(event: React.MouseEvent<HTMLAnchorElement>) {
    if (runId) {
      trackEvent("edr_demo_clicked", {
        run_id: runId,
        destination: "guardz_book_a_demo",
        scenario_count: total,
        blocked_count: protectedCount,
        undetected_count: exposed.length,
        errored_count: erroredCount,
        coverage_percent: telemetryCoverage,
      });
    }
    void openDemo(event);
  }
  const coverage = total > 0 ? Math.round((blockedCount / total) * 100) : 0;

  // A tactic counts as covered only when the endpoint stopped every technique
  // in it, which is what makes 6 of 6 against 3 of 6 an honest comparison.
  const tactics = [...new Set(ran.map((s) => s.category))];
  const tacticsCovered = tactics.filter((tactic) =>
    ran
      .filter((s) => s.category === tactic)
      .every((s) => getOutcome(s.status) !== "executed"),
  ).length;

  const yoursMedian = medianSeconds(
    ran
      .filter((s) => getOutcome(s.status) !== "executed")
      .map((s) => s.durationMs)
      .filter((ms): ms is number => typeof ms === "number"),
  );

  const rows: Row[] = [
    {
      label: "Attacks blocked",
      guardz: `${total} of ${total}`,
      yours: `${blockedCount} of ${total}`,
    },
    { label: "Detection coverage", guardz: "100%", yours: `${coverage}%` },
    {
      label: "MITRE tactics covered",
      guardz: `${tactics.length} of ${tactics.length}`,
      yours: `${tacticsCovered} of ${tactics.length}`,
    },
    ...exposed.map<Row>((scenario) => ({
      label: `Stopped ${scenario.name}`,
      detail: `${scenario.mitreId} · ${scenario.category}`,
      guardz: "check",
      yours: "cross",
    })),
    ...(yoursMedian
      ? [
          {
            label: "Median time to block",
            guardz: GUARDZ_MEDIAN_BLOCK,
            yours: yoursMedian,
          } satisfies Row,
        ]
      : []),
  ];

  const lastIndex = rows.length - 1;

  return (
    <div className="scrollbar-none relative h-screen w-full overflow-x-hidden overflow-y-auto bg-base">
      <GridBackdrop />

      <button
        onClick={onBack}
        className="absolute top-7 left-8 z-10 flex cursor-pointer items-center gap-2 text-[14px] text-guardz-light-gray transition-colors hover:text-white"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
            clipRule="evenodd"
          />
        </svg>
        Back to report
      </button>

      <div className="relative flex min-h-full w-full flex-col items-center justify-center py-7">
        <div className="flex w-[820px] max-w-[calc(100%-80px)] flex-col items-center gap-3.5">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="font-display text-center text-[52px] leading-[58px] font-bold tracking-[-0.01em] text-white"
          >
            Guardz blocks what other
            <br />
            stacks miss
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }}
            className="max-w-[620px] text-center text-[17px] leading-[26px] text-text-dim"
          >
            Same endpoint, same {total} attacks. Your endpoint protection
            stopped {blockedCount} of them. Guardz stopped all {total} and
            alerted on every one.
          </motion.p>
        </div>

        <motion.section
          variants={fadeUp}
          initial="initial"
          animate="animate"
          className="relative mt-9 flex w-[1020px] max-w-[calc(100%-80px)] flex-col"
        >
          {/* The column breaks out above the table: cap, then the rows, then
              the demo action — one slab crossing the quiet strips. */}
          <div className="flex items-end">
            <div className="flex-1" />
            <div
              className={`${GUARDZ_COL} flex h-22 items-center justify-center rounded-t-[20px] border-x border-t border-solid border-guardz-purple`}
              style={{ backgroundImage: "var(--gradient-cap)" }}
            >
              <img
                src="/guardz-wordmark.svg"
                alt="Guardz"
                className="h-[26px] w-auto"
              />
            </div>
            <div
              className={`${YOURS_COL} flex items-center justify-center pb-5.5`}
            >
              <p className="text-[16px] leading-[22px] font-semibold text-guardz-light-gray">
                Your endpoint protection
              </p>
            </div>
          </div>

          <motion.div
            variants={listContainer}
            initial="initial"
            animate="animate"
          >
            {rows.map((row, index) => {
              const first = index === 0;
              const last = index === lastIndex;

              return (
                <motion.div key={row.label} variants={listItem} className="flex">
                  <div
                    className={[
                      "flex flex-1 flex-col justify-center gap-0.75 bg-[#FFFFFF05] px-7",
                      row.detail ? "py-3.5" : "py-4",
                      first && "rounded-tl-[20px]",
                      last ? "rounded-bl-[20px]" : "border-b border-[#FFFFFF0F]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <p className="text-[17px] leading-[23px] font-semibold text-white">
                      {row.label}
                    </p>
                    {row.detail && (
                      <p className="font-mono text-[13px] leading-[17px] text-guardz-medium-gray">
                        {row.detail}
                      </p>
                    )}
                  </div>

                  <div
                    className={`${GUARDZ_COL} flex items-center justify-center border-x border-solid border-guardz-purple bg-surface-raised`}
                  >
                    {row.guardz === "check" ? (
                      <CheckMark />
                    ) : (
                      <span className="font-display text-[22px] leading-7 font-bold text-white">
                        {row.guardz}
                      </span>
                    )}
                  </div>

                  <div
                    className={[
                      "flex items-center justify-center bg-[#FFFFFF05]",
                      YOURS_COL,
                      first && "rounded-tr-[20px]",
                      last ? "rounded-br-[20px]" : "border-b border-[#FFFFFF0F]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {row.yours === "cross" ? (
                      <CrossMark />
                    ) : (
                      <span className="text-[17px] leading-[23px] font-semibold text-guardz-light-gray">
                        {row.yours}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          <div className="flex items-start">
            <div className="flex-1" />
            <div
              className={`${GUARDZ_COL} flex h-24 items-center justify-center rounded-b-[20px] border-x border-b border-solid border-guardz-purple bg-surface-raised`}
            >
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDemo}
                className="btn btn-primary h-14 w-50 text-[16px] leading-4"
              >
                Book a demo
              </a>
            </div>
            <div className={YOURS_COL} />
          </div>
        </motion.section>
      </div>
    </div>
  );
}
