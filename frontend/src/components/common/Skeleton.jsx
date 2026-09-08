import React from "react";

/**
 * Subtle shimmering skeleton primitives for loading states.
 */

export function Skeleton({ className = "" }) {
  return <div className={`animate-shimmer rounded-md ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ lines = 1, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 && lines > 1 ? "h-3.5 w-2/3" : "h-3.5"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  const rows = [1, 2, 3];
  return (
    <div className={`card p-5 ${className}`}>
      <Skeleton className="mb-3 h-4 w-1/3" />
      <Skeleton className="mb-4 h-9 w-full" />
      <div className="space-y-2">
        {rows.map((r) => (
          <Skeleton key={r} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="card flex items-start gap-4 p-5">
      <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="mb-1.5 h-7 w-16" />
        <Skeleton className="mb-1 h-3.5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-200">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
