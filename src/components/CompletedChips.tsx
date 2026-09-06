import { AnimatePresence, motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome, type RunOutcome } from "../utils/verdict";
import { chipIn } from "../lib/motion";

interface CompletedChipsProps {
  completed: Scenario[];
}

const STYLES: Record<
  RunOutcome,
  { border: string; fill: string; badge: string; label: string; text: string }
> = {
  executed: {
    border: "#FC528159",
    fill: "var(--gradient-chip-danger)",
    badge: "#FC52812E",
    label: "#FF9BB6",
    text: "Undetected",
  },
  protected: {
    border: "#A289FC4D",
    fill: "var(--gradient-panel)",
    badge: "#654FE838",
    label: "var(--color-brand-green)",
    text: "Blocked",
  },
  errored: {
    border: "#FFFFFF1F",
    fill: "var(--gradient-panel)",
    badge: "#FFFFFF14",
    label: "var(--color-guardz-light-gray)",
    text: "Didn't run",
  },
};

export default function CompletedChips({ completed }: CompletedChipsProps) {
  if (completed.length === 0) return null;

  const recent = [...completed].reverse().slice(0, 4);

  return (
    <div className="flex shrink-0 flex-col gap-[11px] px-10 pb-7">
      <p className="text-[12px] leading-4 font-semibold tracking-[0.4px] text-text-dim">
        Recently completed
      </p>

      <div className="flex gap-3">
        <AnimatePresence initial={false}>
          {recent.map((scenario) => {
            const outcome = getOutcome(scenario.status);
            const s = STYLES[outcome];

            return (
              <motion.div
                key={scenario.id}
                layout
                variants={chipIn}
                initial="initial"
                animate="animate"
                style={{ borderColor: s.border, backgroundImage: s.fill }}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-solid bg-origin-border px-[13px] py-[11px]"
              >
                <span
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px]"
                  style={{ backgroundColor: s.badge }}
                >
                  {outcome === "protected" ? (
                    <svg width="13" height="13" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        fill="var(--color-brand-green)"
                      />
                    </svg>
                  ) : outcome === "executed" ? (
                    <span className="text-[13px] leading-4 text-guardz-pink">
                      ⚠
                    </span>
                  ) : (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-guardz-light-gray)"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                  )}
                </span>

                <span className="flex min-w-0 flex-col">
                  <span className="line-clamp-1 text-[13px] leading-4 font-semibold text-white">
                    {scenario.name}
                  </span>
                  <span
                    className="text-[11px] leading-[14px] font-semibold"
                    style={{ color: s.label }}
                  >
                    {s.text}
                  </span>
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
