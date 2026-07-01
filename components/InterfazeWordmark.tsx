/* eslint-disable @next/next/no-img-element */
// Full Interfaze logo (chevron mark + wordmark). The wordmark is white, so this
// must sit on a dark surface (e.g. the nav) — not on a white chip. For small /
// light contexts (chat avatars) use InterfazeLogo, the colored icon mark.
export default function InterfazeWordmark({ className }: { className?: string }) {
  return (
    <img
      src="/interfaze_logo.png"
      alt="Interfaze"
      className={className}
      draggable={false}
    />
  );
}
