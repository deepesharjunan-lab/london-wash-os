/* eslint-disable @next/next/no-img-element */

// The London Wash logo from the brand kit (files in public/brand), used by
// every app so they match the website.
//   full     – LW + THE LONDON WASH | the art of laundry.
//   mark     – LW + THE LONDON WASH
//   monogram – the saffron LW on its own (small tiles and headers)
// tone: "dark" = navy wordmark for light backgrounds, "light" = ivory for dark ones.

type Props = {
  variant?: "full" | "mark" | "monogram";
  tone?: "dark" | "light";
  className?: string;
  alt?: string;
};

const SIZE = {
  full: [1191, 318],
  mark: [1000, 256],
  monogram: [532, 252],
} as const;

export function Logo({ variant = "full", tone = "dark", className, alt = "The London Wash, the art of laundry" }: Props) {
  const file =
    variant === "monogram" ? "lw-monogram.png" : `logo-${variant}${tone === "light" ? "-light" : ""}.png`;
  const [width, height] = SIZE[variant];
  // Callers size it with one dimension plus auto for the other, e.g. "h-auto w-[180px]" or "h-7 w-auto".
  return <img src={`/brand/${file}`} width={width} height={height} alt={alt} className={className} />;
}
