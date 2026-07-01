/* eslint-disable @next/next/no-img-element */
export default function InterfazeLogo({ className }: { className?: string }) {
  return (
    <img
      src="/interfaze_icon.svg"
      alt="Interfaze"
      className={className}
      draggable={false}
    />
  );
}
