import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "../common/Card";
import Loader from "../common/Loader";
import { getAnalyticsSummary } from "../../services/analyticsApi";
import { useChartTheme } from "../../hooks/useChartTheme";

/**
 * Donut chart showing alert risk distribution with total in the center.
 * Backed by the real analytics API.
 */
function RiskDistribution() {
  const chart = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    let active = true;
    getAnalyticsSummary()
      .then((res) => active && setData((res.data && res.data.riskDistribution) || []))
      .catch(() => active && setData([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Card className="flex h-full min-h-52 items-center justify-center">
        <Loader />
      </Card>
    );
  }

  const total = data.reduce((s, i) => s + i.value, 0);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Risk Distribution
        </h3>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          No alert data available yet.
        </p>
      ) : (
        <>
          <div className="relative h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
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
                <p className="text-xs text-slate-500">Active Alerts</p>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {data.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: d.color }}
                    aria-hidden="true"
                  />
                  {d.name}
                </span>
                <span className="font-medium text-slate-800">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export default RiskDistribution;
