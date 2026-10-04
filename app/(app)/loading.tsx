// Shown instantly while a console page loads, so a click always gives feedback.

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-2 h-3 w-24 rounded bg-black/[0.07]" />
      <div className="mb-3 h-7 w-64 rounded bg-black/[0.09]" />
      <div className="mb-6 h-4 w-full max-w-xl rounded bg-black/[0.06]" />
      <div className="mb-5 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-black/[0.06]" />
        ))}
      </div>
      <div className="space-y-2 border-2 border-black/5 bg-white p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 rounded bg-black/[0.05]" />
        ))}
      </div>
    </div>
  );
}
