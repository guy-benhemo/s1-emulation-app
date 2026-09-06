import { motion } from "motion/react";
import GuardzMark from "./GuardzMark";
import GridBackdrop from "./GridBackdrop";
import { heroContainer, heroItem, heroMark } from "../lib/motion";

interface WelcomeScreenProps {
  onRunAll: () => void;
  onSelectIndividual: () => void;
}

export default function WelcomeScreen({
  onRunAll,
  onSelectIndividual,
}: WelcomeScreenProps) {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-base">
      <GridBackdrop />

      <motion.div
        variants={heroContainer}
        initial="initial"
        animate="animate"
        className="relative flex flex-col items-center gap-[26px] px-10"
      >
        <motion.div variants={heroMark}>
          <GuardzMark size={74} radius={20} glyph={42} />
        </motion.div>

        <div className="flex flex-col items-center gap-[18px]">
          <motion.h1
            variants={heroItem}
            className="text-display-hero text-center text-white"
          >
            EDR Attack Simulator
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="max-w-[520px] text-center text-[17px] leading-[27px] text-text-soft"
          >
            Test your endpoint protection against real attack techniques.
            <br />
            See exactly where you are covered, and what gaps to close.
          </motion.p>
        </div>

        <motion.div
          variants={heroItem}
          className="mt-2 flex items-center gap-[14px]"
        >
          <button
            onClick={onRunAll}
            className="btn btn-primary gap-[10px] px-8 py-[15px] text-[16px] leading-5"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            Run full scan
          </button>

          <button
            onClick={onSelectIndividual}
            className="btn btn-secondary px-7 py-[15px] text-[16px] leading-5"
          >
            Select individual tests
          </button>
        </motion.div>
      </motion.div>

      <motion.figure
        variants={heroItem}
        initial="initial"
        animate="animate"
        transition={{ delay: 0.35 }}
        style={{
          backgroundImage:
            "linear-gradient(in oklab 180deg, oklab(21.7% 0.019 -0.044 / 66%) 0%, oklab(18.1% 0.014 -0.038 / 62%) 100%)",
        }}
        className="absolute bottom-[86px] flex w-[900px] items-center gap-[28px] rounded-[20px] border border-[#A289FC29] bg-origin-border px-[34px] py-[26px] shadow-[0_24px_60px_-34px_#000000D9]"
      >
        <div className="h-[104px] w-[86px] shrink-0 overflow-hidden rounded-[16px] border border-[#FFFFFF1F] shadow-[0_10px_26px_-14px_#000000A6]">
          <img
            src="/elli.jpg"
            alt="Elli Shlomo"
            className="h-full w-full object-cover object-center"
          />
        </div>

        <div className="flex flex-1 flex-col gap-[15px]">
          <blockquote className="text-[19px] leading-[30px] tracking-[-0.01em] text-[#E9E7F2]">
            &ldquo;We built this test so MSPs can see precisely where their EDR
            falls short, from missed detections to response gaps, measured
            against real-world attacks&rdquo;.
          </blockquote>
          <figcaption className="flex items-center gap-[10px]">
            <span className="text-[15px] leading-[18px] font-semibold tracking-[0.005em] text-guardz-light-purple">
              Elli Shlomo
            </span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-[#FFFFFF4D]" />
            <span className="text-[14px] leading-[18px] tracking-[0.005em] text-guardz-light-gray">
              Head of Security Research
            </span>
          </figcaption>
        </div>
      </motion.figure>

      <div className="absolute bottom-[30px] flex items-center gap-2">
        <span className="text-[13px] leading-4 text-[#FFFFFF80]">
          Powered by
        </span>
        <img
          src="/guardz-wordmark.svg"
          alt="Guardz"
          className="h-[19px] w-[100px]"
        />
      </div>
    </div>
  );
}
