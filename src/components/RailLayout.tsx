import { ReactNode } from "react";
import { motion } from "motion/react";
import GuardzMark from "./GuardzMark";
import GridBackdrop from "./GridBackdrop";
import { heroContainer, heroItem } from "../lib/motion";

interface RailLayoutProps {
  /** The rail's title block. Each board sets its own type, so the screen
   *  supplies the whole group rather than a title/subtitle pair. */
  heading: ReactNode;
  middle?: ReactNode;
  bottom?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export default function RailLayout({
  heading,
  middle,
  bottom,
  action,
  children,
}: RailLayoutProps) {
  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <GridBackdrop />

      <aside className="relative flex w-[392px] shrink-0 flex-col justify-between overflow-hidden border-r border-guardz-light-purple bg-surface-raised px-[38px] py-10">
        <motion.div
          variants={heroContainer}
          initial="initial"
          animate="animate"
          className="flex flex-col gap-6"
        >
          <motion.div
            variants={heroItem}
            className="flex items-center gap-[11px]"
          >
            <GuardzMark size={34} radius={10} glyph={21} />
          </motion.div>

          <motion.div variants={heroItem}>{heading}</motion.div>
        </motion.div>

        {middle}

        {(bottom || action) && (
          <div className="flex flex-col gap-[18px]">
            {bottom}
            {action}
          </div>
        )}
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
