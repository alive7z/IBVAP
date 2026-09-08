import React from "react";

/**
 * Shared pagination controls for intelligence tabs.
 */
function Pagination({ total, page, pageSize, onChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const from = total ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, total);

  const nums = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - safePage) <= 1) nums.push(i);
  }
  const items = [];
  let prev = 0;
  nums.forEach((n) => {
    if (n - prev > 1) items.push("…");
    items.push(n);
    prev = n;
  });

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}–{to}</span> of {total} records
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={safePage <= 1}
            onClick={() => onChange(safePage - 1)}
          >
            Previous
          </button>
          {items.map((it, i) =>
            it === "…" ? (
              <span key={`e${i}`} className="px-1 text-xs text-slate-400">
                …
              </span>
            ) : (
              <button
                key={it}
                onClick={() => onChange(it)}
                className={`btn-focus rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  it === safePage
                    ? "border-blue-700 bg-blue-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {it}
              </button>
            )
          )}
          <button
            className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={safePage >= pageCount}
            onClick={() => onChange(safePage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default Pagination;
