// A static "blueprint house" glyph for card visuals — deliberately not a live
// HouseViewer3D per card: a WebGL context per grid item risks the browser's
// concurrent-context limit and costs GPU for something nobody is looking at.
// currentColor, so it inherits the tint of whatever container it sits in.
export default function HouseGlyph() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 30 L32 12 L56 30" />
      <path d="M14 26 V54 H50 V26" />
      <path d="M26 54 V38 H38 V54" />
      <path d="M20 34 H24 M40 34 H44" />
      <path d="M32 12 V4" />
    </svg>
  );
}
