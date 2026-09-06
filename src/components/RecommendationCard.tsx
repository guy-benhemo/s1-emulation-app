import { motion } from "motion/react";
import { Recommendation, Scenario, Severity } from "../types";
import { listItem } from "../lib/motion";

interface RecommendationCardProps {
  scenario: Scenario;
  recommendation: Recommendation;
}

/** Left rule and pill per severity, off the recommendation rows on A6. */
const TONE: Record<Severity, { rule: string; pill: string; text: string }> = {
  High: { rule: "#B0284F", pill: "#B0284F38", text: "#FF8FA8" },
  Medium: { rule: "#C2410C", pill: "#FC528133", text: "#F5AB65" },
  Low: { rule: "#C2410C", pill: "#FC528133", text: "#F5AB65" },
};

export default function RecommendationCard({
  scenario,
  recommendation,
}: RecommendationCardProps) {
  const tone = TONE[recommendation.severity];

  return (
    <motion.article
      variants={listItem}
      style={{
        backgroundImage: "var(--gradient-rec)",
        borderLeftColor: tone.rule,
      }}
      className="flex shrink-0 gap-4 rounded-[18px] border border-[#A289FC59] border-l-4 border-solid bg-origin-border px-[18px] py-3.5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <div className="flex flex-wrap items-center gap-[9px]">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[13px] leading-4 font-bold"
            style={{ backgroundColor: tone.pill, color: tone.text }}
          >
            {recommendation.severity} severity
          </span>
          <h3 className="text-[18px] leading-[23px] font-bold text-white">
            {scenario.name}
          </h3>
          <span className="font-mono text-[13px] leading-4 text-text-dim">
            {scenario.mitreId}
          </span>
        </div>

        <p className="text-[16px] leading-6 text-text-soft">
          {recommendation.action}
        </p>

        <p className="text-[14px] leading-[18px] text-text-dim">
          Impact: {recommendation.impact}
        </p>
      </div>
    </motion.article>
  );
}
