export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-8 w-56" />
      <div className="skeleton mb-8 h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
      </div>
      <div className="skeleton mt-6 h-72" />
    </div>
  );
}
