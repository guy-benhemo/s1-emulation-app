import { motion } from "motion/react";
import { Scenario } from "../types";
import { getOutcome, type RunOutcome } from "../utils/verdict";
import { EASE_OUT, verdictPop } from "../lib/motion";

interface VerdictCardProps {
  scenario: Scenario;
}

interface Tone {
  glow: string;
  halo: string;
  disc: string;
  discShadow: string;
  rule: string;
  ruleShadow: string;
  label: string;
  labelColor: string;
}

const TONE: Record<RunOutcome, Tone> = {
  protected: {
    glow: "0 0 40px #4FE88224",
    halo: "#A289FC24",
    disc: "var(--gradient-mark)",
    discShadow: "0 8px 22px #654FE873",
    rule: "var(--gradient-mark)",
    ruleShadow: "0 8px 22px #654FE873",
    label: "Protected",
    labelColor: "var(--color-brand-green)",
  },
  executed: {
    glow: "0 0 40px #FC528124",
    halo: "#FC528124",
    disc: "var(--gradient-danger)",
    discShadow: "0 8px 22px #FC528166",
    rule: "var(--gradient-danger-bar)",
    ruleShadow: "none",
    label: "Undetected",
    labelColor: "#FF7A9C",
  },
  errored: {
    glow: "0 0 40px #FFFFFF14",
    halo: "#FFFFFF14",
    disc: "linear-gradient(in oklab 262deg, oklab(52% 0 0) 0%, oklab(34% 0 0) 100%)",
    discShadow: "0 8px 22px #00000066",
    rule: "linear-gradient(in oklab 90deg, oklab(62% 0 0) 0%, oklab(42% 0 0) 100%)",
    ruleShadow: "none",
    label: "Didn't run",
    labelColor: "var(--color-guardz-light-gray)",
  },
};

export default function VerdictCard({ scenario }: VerdictCardProps) {
  const outcome = getOutcome(scenario.status);
  const tone = TONE[outcome];
  const seconds = ((scenario.durationMs ?? 800) / 1000).toFixed(1);

  const detail =
    outcome === "executed"
      ? `Bypassed your endpoint in ${seconds}s — needs attention`
      : outcome === "protected"
        ? `Blocked by your endpoint in ${seconds}s`
        : "The runner could not start this attack, so it proves nothing about your defenses.";

  return (
    <div
      className="relative flex w-[640px] max-w-full flex-col items-center gap-4 overflow-hidden rounded-[22px] border border-[#A289FC66] bg-origin-border p-[34px]"
      style={{
        backgroundImage: "var(--gradient-panel)",
        boxShadow: tone.glow,
      }}
    >
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        style={{
          transformOrigin: "left",
          backgroundImage: tone.rule,
          boxShadow: tone.ruleShadow,
        }}
        className="absolute inset-x-0 top-0 h-1"
      />

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="text-verdict-title text-center text-white"
      >
        {scenario.name}
      </motion.h2>

      <motion.div
        variants={verdictPop}
        initial="initial"
        animate="animate"
        className="mt-1 flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: tone.halo }}
      >
        <span
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full"
          style={{ backgroundImage: tone.disc, boxShadow: tone.discShadow }}
        >
          {outcome === "protected" ? (
            <svg width="24" height="24" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                fill="#FFFFFF"
              />
            </svg>
          ) : outcome === "executed" ? (
            <span className="text-center text-[22px] leading-7 text-white">
              ⚠
            </span>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.4}
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          )}
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08, ease: EASE_OUT }}
        className="flex flex-col items-center gap-1"
      >
        <p
          className="text-verdict-label text-center"
          style={{ color: tone.labelColor }}
        >
          {tone.label}
        </p>
        <p className="text-center text-[13px] leading-4 text-text-dim">
          {detail}
        </p>
      </motion.div>

      {outcome === "errored" && scenario.message ? (
        <p className="max-w-[460px] truncate text-center font-mono text-[12px] text-guardz-light-gray/60">
          {scenario.message}
        </p>
      ) : null}
    </div>
  );
}
