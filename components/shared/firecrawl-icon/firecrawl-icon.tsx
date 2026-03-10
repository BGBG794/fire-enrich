import { HTMLAttributes } from "react";

export default function FirecrawlIcon({
  fill,
  innerFillColor,
  ...attrs
}: HTMLAttributes<HTMLOrSVGElement> & {
  innerFillColor?: string;
  fill?: string;
}) {
  return (
    <svg
      {...attrs}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 20, height: 20 }}
    >
      <path
        d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
        fill="url(#fire-enrich-grad)"
        stroke="url(#fire-enrich-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="fire-enrich-grad" x1="3" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6B6B" />
          <stop offset="1" stopColor="#FF8E53" />
        </linearGradient>
      </defs>
    </svg>
  );
}
