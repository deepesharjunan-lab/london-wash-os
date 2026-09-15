// Standalone layout for printable documents (invoices, garment tags).
// Deliberately does NOT render the console's sidebar/header - it lives in
// its own route group (print) so these routes never inherit the admin
// shell from app/(app)/layout.tsx. That's what lets each print page fill
// the whole tab/iframe with just the receipt or label content, and print
// only that content instead of the entire console page.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
