import { motion } from "motion/react";
import { Scenario } from "../types";
import { EASE_OUT, listItem } from "../lib/motion";

interface TechniqueCardProps {
  scenario: Scenario;
  selected: boolean;
  onToggle: () => void;
}

export default function TechniqueCard({
  scenario,
  selected,
  onToggle,
}: TechniqueCardProps) {
  return (
    <motion.button
      variants={listItem}
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        backgroundImage: selected
          ? "var(--gradient-tile-on)"
          : "var(--gradient-tile-off)",
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? "#A289FCB3" : "#A289FC4D",
      }}
      className="flex h-[116px] w-full cursor-pointer flex-col gap-[10px] rounded-[18px] border-solid bg-origin-border p-4 text-left transition-colors duration-200"
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[14px] leading-[18px] font-semibold text-[#C9BCFF]"
            style={{ backgroundColor: selected ? "#A289FC2E" : "#A289FC24" }}
          >
            {scenario.mitreId}
          </span>
          <span className="truncate text-[16px] leading-5 font-bold tracking-[0.5px] text-white">
            {scenario.name}
          </span>
        </span>

        {selected ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundImage: "var(--gradient-mark)",
              boxShadow: "0 0 14px #654FE899",
            }}
          >
            <motion.svg
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              width="16"
              height="16"
              viewBox="0 -6.667 26.667 26.667"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M22.276 0.391a1.333 1.333 0 0 1 0 1.885l-10.666 10.667a1.333 1.333 0 0 1-1.886 0l-5.333-5.334a1.333 1.333 0 0 1 1.885-1.885L10.667 10.115l9.724-9.724a1.333 1.333 0 0 1 1.885 0z"
                fill="#FFFFFF"
              />
            </motion.svg>
          </span>
        ) : (
          <span
            className="inline-block h-6 w-6 shrink-0 rounded-full border-solid"
            style={{ borderWidth: 1.5, borderColor: "#A289FC80" }}
          />
        )}
      </div>

      <p className="text-[16px] leading-[145%] tracking-[0.5px] text-text-dim">
        {scenario.question}
      </p>
    </motion.button>
  );
}
