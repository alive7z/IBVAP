import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import Card from "../common/Card";
import Loader from "../common/Loader";
import { getAnalyticsSummary } from "../../services/analyticsApi";
import { useChartTheme } from "../../hooks/useChartTheme";

const seriesConfig = {
  Critical: { color: "#dc2626" },
  High: { color: "#f97316" },
  Medium: { color: "#eab308" },
  Low: { color: "#22c55e" },
};

const keys = Object.keys(seriesConfig);

/**
 * Alert trend line chart, last 7 days.
 * Backed by the real analytics API (daily totals split by severity ratio).
 */
function AlertTrend() {
  const chart = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    let active = true;
    getAnalyticsSummary()
      .then((res) => {
        if (!active) return;
        const trend = res.data && res.data.alertTrend;
        if (!trend || !trend.days) {
          setData([]);
          return;
        }
        setData(
          trend.days.map((day, i) => ({
            day,
            Critical: trend.series.Critical[i] || 0,
            High: trend.series.High[i] || 0,
            Medium: trend.series.Medium[i] || 0,
            Low: trend.series.Low[i] || 0,
          }))
        );
      })
      .catch(() => active && setData([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Card className="flex h-full min-h-64 items-center justify-center">
        <Loader />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Alert Trend – Last 7 Days
        </h3>
      </div>
      {data.length === 0 ? (
        <p className="flex h-64 items-center justify-center text-sm text-slate-400">
          No alert trend data available yet.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: chart.tick }}
                axisLine={{ stroke: chart.axis }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: chart.tick }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${chart.tooltipBorder}`,
                  background: chart.tooltipBg,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                }}
                labelStyle={{ color: chart.tooltipText }}
                itemStyle={{ color: chart.tooltipText }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: chart.legendText }} />
              {keys.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={seriesConfig[key].color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: seriesConfig[key].color, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export default AlertTrend;
