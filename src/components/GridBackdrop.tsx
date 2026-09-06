/**
 * The page ground: the brand's own dark-blue gradient artwork — ink, the
 * violet corner bloom, the bottom glow and the lattice, all in one file. The
 * same asset the boards paint, covering the window top-centre exactly as they
 * cover a board.
 *
 * It used to be rebuilt in CSS: an 88px `bg-grid` layer at 0.12 alpha plus a
 * radial bloom per page. Two things were wrong with that. The lines came out
 * several times too strong, so the lattice dominated instead of receding; and
 * a fixed 88px pitch is larger than the artwork's own lattice at page scale,
 * which is why the grid read as zoomed in against the boards.
 */
export default function GridBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-base"
      style={{
        backgroundImage: "url(/brand-ground.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "50% 0%",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
