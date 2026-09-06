import { motion } from "motion/react";
import { EASE_OUT } from "../lib/motion";

interface GradeRingProps {
  /** 0–100 readiness score. */
  score: number;
  grade: string;
  /** Ring colour. The board draws it on the grade's tone. */
  color?: string;
  size?: number;
}

/** 124px ring, 9px stroke, r=52 — the dial in the rail on A6. */
export default function GradeRing({
  score,
  grade,
  color = "var(--color-brand-green)",
  size = 124,
}: GradeRingProps) {
  const stroke = 9;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(score, 0), 100) / 100);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 124 124"
        style={{ rotate: "-90deg", transformOrigin: "50% 50%" }}
      >
        <circle
          cx="62"
          cy="62"
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 18%)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx="62"
          cy="62"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
        />
      </svg>
      <span className="absolute font-display text-[42px] leading-none font-bold text-white">
        {grade}
      </span>
    </div>
  );
}
