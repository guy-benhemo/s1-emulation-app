import { motion } from "motion/react";
import { Scenario } from "../types";
import RailLayout from "./RailLayout";
import TechniqueCard from "./TechniqueCard";
import { listContainer } from "../lib/motion";

interface SelectionScreenProps {
  scenarios: Scenario[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRunSelected: () => void;
  onBack: () => void;
}

export default function SelectionScreen({
  scenarios,
  selectedIds,
  onToggle,
  onRunSelected,
  onBack,
}: SelectionScreenProps) {
  const total = scenarios.length;
  const count = selectedIds.length;

  return (
    <RailLayout
      heading={
        <div className="flex flex-col gap-4">
          <h1 className="text-rail-title text-white">
            Choose the attacks to simulate
          </h1>
          <p className="text-[18px] leading-[150%] tracking-[0.5px] text-[#FFFFFFBF]">
            Pick the attacks you want to test against this endpoint, or run the
            full suite. Every test is safe and self-cleaning.
          </p>
        </div>
      }
      action={
        <button
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-2 text-[13px] leading-4 font-medium text-[#FFFFFFB3] transition-colors hover:text-white"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(255 255 255 / 60%)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
      }
    >
      <header className="flex shrink-0 items-center gap-6 px-[34px] pt-6 pb-12">
        <h2 className="text-canvas-title text-white">Attack Techniques</h2>
      </header>

      <motion.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        className="scrollbar-none grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-4 overflow-y-auto px-[34px] pt-0.5 pb-3"
      >
        {scenarios.map((scenario) => (
          <TechniqueCard
            key={scenario.id}
            scenario={scenario}
            selected={selectedIds.includes(scenario.id)}
            onToggle={() => onToggle(scenario.id)}
          />
        ))}
      </motion.div>

      <footer className="mt-auto flex shrink-0 items-center justify-between border-t border-[#A289FC33] px-[34px] py-4">
        <span className="text-[14px] leading-[18px] font-medium text-guardz-off-white">
          {count} of {total} techniques selected
        </span>
        <button
          onClick={onRunSelected}
          disabled={count === 0}
          className="btn btn-primary gap-[9px] px-[26px] py-[13px] text-[15px] leading-[18px]"
        >
          Run {count > 0 ? `${count} ` : ""}Selected
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </footer>
    </RailLayout>
  );
}
