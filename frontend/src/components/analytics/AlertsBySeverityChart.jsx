import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import ChartCard from "./ChartCard";
import { useChartTheme } from "../../hooks/useChartTheme";

/**
 * Donut chart of alert counts by severity with a legend.
 */
function AlertsBySeverityChart({ data = [] }) {
  const chart = useChartTheme();
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  return (
    <ChartCard title="Alerts by Severity" subtitle="Distribution across severity levels">
      <div className="relative h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color || "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value} alerts`, name]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${chart.tooltipBorder}`,
                background: chart.tooltipBg,
              }}
              labelStyle={{ color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{total}</p>
            <p className="text-xs text-slate-500">Alerts</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: d.color || "#94a3b8" }}
                aria-hidden="true"
              />
              {d.name}
            </span>
            <span className="font-medium text-slate-800">{d.value}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

export default AlertsBySeverityChart;
