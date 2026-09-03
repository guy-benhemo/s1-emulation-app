import { motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome } from "../utils/verdict";
import { isTauri } from "../lib/executor";
import { trackEvent } from "../lib/analytics";
import { EASE_OUT, fadeUp, listContainer, listItem } from "../lib/motion";
import GridBackdrop from "./GridBackdrop";
import GuardzMark from "./GuardzMark";

export const DEMO_URL =
  "https://guardz.com/book-a-demo?utm_source=edr_attack_sim";

interface CompareScreenProps {
  scenarios: Scenario[];
  runQueue: string[];
  runId: string | null;
  onBack: () => void;
}

const BENEFITS = [
  "Prioritize risk across every client",
  "Replace fragmented tools and cut costs",
  "Scale security delivery without adding headcount",
];

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

function Stars({ count = 5 }: { count?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="h-3 w-3 text-white/85"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
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
  const coverage = tested > 0 ? Math.round((protectedCount / tested) * 100) : 0;

  function handleDemo(event: React.MouseEvent<HTMLAnchorElement>) {
    if (runId) {
      trackEvent("edr_demo_clicked", {
        run_id: runId,
        destination: "guardz_book_a_demo",
        scenario_count: total,
        blocked_count: protectedCount,
        undetected_count: exposed.length,
        errored_count: erroredCount,
        coverage_percent: coverage,
      });
    }
    void openDemo(event);
  }

  return (
    <div className="scrollbar-slim relative h-screen w-full overflow-y-auto bg-[#0B0819]">
      <GridBackdrop intensity="hero" />

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

      <div className="relative mx-auto flex w-full max-w-[1000px] flex-col items-center px-10 pt-16 pb-20">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="text-center font-display text-[46px] leading-[54px] font-bold tracking-[-0.02em] text-white"
        >
          Guardz blocks what your stack missed
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }}
          className="mt-4 max-w-[740px] text-center text-[16px] leading-[26px] text-guardz-light-gray"
        >
          Your endpoint protection stopped {blockedCount} of {total} attacks on
          its own. Running the same {total} attacks against a Guardz-protected
          endpoint, every one is caught.
        </motion.p>

        <div className="mt-12 grid w-full grid-cols-2 gap-6">
          {/* Your endpoint */}
          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="rounded-[16px] border border-white/8 bg-white/[0.02] px-6 py-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-white">Your endpoint</h2>
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[12px] text-guardz-light-gray">
                Unmanaged
              </span>
            </div>

            <p className="mt-5 flex items-baseline gap-3">
              <span className="font-display text-[46px] leading-none font-bold text-white/45">
                {blockedCount}/{total}
              </span>
              <span className="text-[14px] text-guardz-light-gray">
                attacks blocked · {exposed.length} gaps
              </span>
            </p>

            <div className="mt-5 border-t border-white/8 pt-4">
              <motion.ul
                variants={listContainer}
                initial="initial"
                animate="animate"
                className="flex flex-col gap-3"
              >
                {exposed.map((s) => (
                  <motion.li
                    key={s.id}
                    variants={listItem}
                    className="flex items-center gap-3"
                  >
                    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-guardz-pink/20">
                      <svg
                        className="h-2.5 w-2.5 text-guardz-pink"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">
                      {s.name}
                    </span>
                    <span className="text-[14px] font-medium text-guardz-pink">
                      Exposed
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </motion.section>

          {/* With Guardz */}
          <motion.section
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.4, delay: 0.08, ease: EASE_OUT }}
            className="relative rounded-[16px] border border-guardz-light-purple/30 bg-guardz-purple/[0.10] px-6 py-6"
          >
            <span
              className="absolute -top-3 right-5 rounded-full px-3 py-1 text-[12px] font-medium text-white"
              style={{ backgroundImage: "var(--gradient-purple)" }}
            >
              Catches all {total}
            </span>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <GuardzMark size={22} className="rounded-[7px]" />
                <h2 className="text-[18px] font-bold text-white">With Guardz</h2>
              </div>
              <span className="rounded-full border border-guardz-light-purple/30 bg-guardz-purple/20 px-3 py-1 text-[12px] text-guardz-bright-purple">
                Managed
              </span>
            </div>

            <p className="mt-5 flex items-baseline gap-3">
              <span className="font-display text-[46px] leading-none font-bold text-white">
                {total}/{total}
              </span>
              <span className="text-[14px] text-guardz-light-gray">
                attacks blocked · 0 gaps
              </span>
            </p>

            <div className="mt-5 border-t border-guardz-light-purple/20 pt-4">
              <motion.ul
                variants={listContainer}
                initial="initial"
                animate="animate"
                className="flex flex-col gap-3"
              >
                {exposed.map((s) => (
                  <motion.li
                    key={s.id}
                    variants={listItem}
                    className="flex items-center gap-3"
                  >
                    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-guardz-purple/40">
                      <svg
                        className="h-2.5 w-2.5 text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">
                      {s.name}
                    </span>
                    <span className="text-[14px] font-medium text-guardz-light-purple">
                      Blocked
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </motion.section>
        </div>

        {/* CTA band */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.14, ease: EASE_OUT }}
          className="relative mt-8 flex w-full items-center justify-between gap-10 overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,#8A6BFF_0%,#6E52F5_50%,#6146EC_100%)] px-9 py-8"
        >
          <div className="relative min-w-0">
            <h3 className="font-display text-[27px] leading-[34px] font-bold text-white">
              Unify your MSP security stack
            </h3>
            <p className="mt-2 text-[15px] text-white/85">
              See how Guardz stops all {total} attacks and more in a live
              30-minute demo.
            </p>

            <ul className="mt-5 flex flex-col gap-2.5">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2.5">
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-white/25">
                    <svg
                      className="h-2.5 w-2.5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="text-[15px] text-white">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex shrink-0 flex-col items-center gap-4">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDemo}
              className="btn btn-light h-[56px] gap-[10px] px-8 text-[16px] leading-5"
            >
              Book a demo
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>

            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-[#FF492C] text-[9px] font-bold text-white">
                  G
                </span>
                <Stars />
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-white/90">
                  Capterra
                </span>
                <Stars />
              </span>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
