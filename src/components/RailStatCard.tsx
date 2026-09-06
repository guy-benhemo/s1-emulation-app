import { ReactNode } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "../lib/motion";

interface RailStatCardProps {
  label: string;
  value: ReactNode;
  /** 0–100 fill for the track. */
  percent: number;
  footer?: ReactNode;
}

/** "Progress · Test 5 of 9" in the rail on A3–A5. */
export default function RailStatCard({
  label,
  value,
  percent,
  footer,
}: RailStatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[#FFFFFF29] bg-[#FFFFFF14] px-[18px] py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] leading-4 font-medium text-[#FFFFFFBF]">
          {label}
        </span>
        <span className="font-display text-[18px] leading-[22px] font-bold text-white">
          {value}
        </span>
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-[#FFFFFF29]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundImage: "var(--gradient-bar)" }}
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        />
      </div>

      {footer}
    </div>
  );
}
