import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Scenario } from "../types";
import { statusSwap } from "../lib/motion";

const MESSAGES = [
  "Probing for security gaps…",
  "Testing endpoint defenses…",
  "Watching for detection response…",
  "Measuring mitigation behaviour…",
];

interface ScanningCardProps {
  scenario: Scenario;
}

export default function ScanningCard({ scenario }: ScanningCardProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setMessageIndex((i) => (i + 1) % MESSAGES.length),
      2500,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex w-[640px] max-w-full flex-col items-center gap-[18px] rounded-[22px] border border-[#A289FC66] bg-origin-border px-[34px] py-8 shadow-[0_0_40px_#654FE826]"
      style={{ backgroundImage: "var(--gradient-panel)" }}
    >
      <h2 className="text-card-title text-center text-white">
        {scenario.name}
      </h2>

      <p className="max-w-[440px] text-center text-[16px] leading-6 text-text-dim">
        {scenario.question}
      </p>

      <div className="mt-1.5 flex w-[340px] max-w-full flex-col items-center gap-[13px]">
        <div className="relative h-1.75 w-full overflow-hidden rounded-full bg-[#A289FC24]">
          <div
            className="animate-scan-sweep absolute inset-y-0 left-0 w-[38%] rounded-full shadow-[0_0_14px_#654FE899]"
            style={{ backgroundImage: "var(--gradient-bar)" }}
          />
        </div>

        <div className="h-[18px] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              variants={statusSwap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="text-center text-[14px] leading-[18px] font-medium text-guardz-light-purple"
            >
              {MESSAGES[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
