import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import ChartCard from "./ChartCard";
import { useChartTheme } from "../../hooks/useChartTheme";

/**
 * Area chart of event counts across the day, bucketed by 4h intervals.
 */
function EventsByTimeChart({ data = [] }) {
  const chart = useChartTheme();
  const lineColor = chart.isDark ? "#4f8fef" : "#0f2a4f";
  const labels = { "00": "00:00", "04": "04:00", "08": "08:00", "12": "12:00", "16": "16:00", "20": "20:00" };
  const chartData = data.map((d) => ({ ...d, label: labels[d.hour] || d.hour }));

  return (
    <ChartCard title="Events by Time" subtitle="Detection events by time of day">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -22 }}>
            <defs>
              <linearGradient id="evtTimeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="label"
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
              formatter={(value) => [`${value} events`, "Events"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${chart.tooltipBorder}`,
                background: chart.tooltipBg,
              }}
              labelStyle={{ color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#evtTimeFill)"
              dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default EventsByTimeChart;
