export function PageSkeleton() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="h-7 w-40 bg-bg-muted rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-bg-elevated border border-border-default rounded-lg p-4 animate-pulse"
          >
            <div className="h-4 bg-bg-muted rounded w-2/3 mb-3" />
            <div className="h-3 bg-bg-muted rounded w-full mb-2" />
            <div className="h-3 bg-bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
