import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import ChartCard from "./ChartCard";
import { useChartTheme } from "../../hooks/useChartTheme";
import { prepareEventsByType } from "../../utils/eventTypeLabels";

/**
 * Horizontal bar chart of event counts by detection type. Raw backend event
 * codes stay untouched; display names are derived only for this chart.
 */
function EventsByTypeChart({ data = [] }) {
  const chart = useChartTheme();
  const chartData = useMemo(() => prepareEventsByType(data), [data]);
  const chartHeight = Math.max(256, chartData.length * 42 + 24);

  return (
    <ChartCard title="Events by Type" subtitle="Detection events by category">
      <div style={{ height: chartHeight }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 34, bottom: 0, left: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12, fill: chart.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="displayName"
              width={160}
              interval={0}
              tick={{ fontSize: 11, fill: chart.tick }}
              axisLine={{ stroke: chart.axis }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: chart.isDark ? "rgba(148,163,184,0.12)" : "rgba(15,42,79,0.05)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${chart.tooltipBorder}`,
                background: chart.tooltipBg,
              }}
              labelStyle={{ color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
              formatter={(value) => [`${value} events`, "Events"]}
            />
            <Bar
              dataKey="value"
              name="Events"
              fill={chart.isDark ? "#4f8fef" : "#0f2a4f"}
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
            >
              <LabelList
                dataKey="value"
                position="right"
                fill={chart.tick}
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default EventsByTypeChart;
