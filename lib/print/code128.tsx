// Minimal, dependency-free Code128 Subset-C barcode encoder + SVG renderer.
// Subset C packs digit PAIRS into a single symbol, which is the most compact
// encoding for purely numeric data (our garment tag codes). The pattern table
// and checksum algorithm below were ported from, and verified byte-for-byte
// against, the widely-used `python-barcode` reference implementation.
import type { ReactElement } from "react";

const CODE128_PATTERNS: string[] = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100",
  "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100",
  "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110",
  "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110",
  "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000",
  "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100",
  "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100",
  "11010010000", "11010011100",
];
const STOP_PATTERN = "11000111010";
const START_C = 105;

/** Returns the raw module bit-string (1 = black bar, 0 = white space) for a numeric value. */
export function code128cBits(rawValue: string | number): string {
  const digitsOnly = String(rawValue).replace(/\D/g, "") || "0";
  const padded = digitsOnly.length % 2 === 0 ? digitsOnly : "0" + digitsOnly;

  const values: number[] = [START_C];
  for (let i = 0; i < padded.length; i += 2) {
    values.push(parseInt(padded.slice(i, i + 2), 10));
  }

  let checksum = values[0];
  for (let i = 1; i < values.length; i++) checksum += i * values[i];
  checksum %= 103;
  values.push(checksum);

  return values.map((v) => CODE128_PATTERNS[v]).join("") + STOP_PATTERN + "11";
}

/** Server-renderable Code128C barcode as an inline SVG (no client JS or fonts required). */
export function Barcode({
  value,
  height = 30,
  moduleWidth = 1.3,
}: {
  value: string | number;
  height?: number;
  moduleWidth?: number;
}) {
  const bits = code128cBits(value);
  const width = bits.length * moduleWidth;
  let x = 0;
  const rects: ReactElement[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      rects.push(<rect key={i} x={x} y={0} width={moduleWidth} height={height} fill="#000000" />);
    }
    x += moduleWidth;
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", margin: "0 auto" }}
    >
      {rects}
    </svg>
  );
}
