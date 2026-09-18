"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "@/lib/dates";

/** Categorical order validated for colour-blind separation; colour follows the site, never its rank. */
export const SERIES = ["#0077AD", "#E0782B", "#1F9E89", "#7B61C9", "#D1557A"];
const INK = "#0b0f12";
const MUTED = "#5a6872";
const GRID = "#e3e9ee";
const BAND_FILL: Record<string, string> = { perfect: "#b8913f", meets: "#12804a", below: "#e6a23c", fail: "#d8453d" };

const axisTick = { fill: MUTED, fontSize: 12 };

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-[var(--shadow-float)]">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            {r.color ? <span className="size-2 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="font-semibold tabular">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const fmt = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 10) / 10}%` : "—");
/** Percentage ticks on multiples of 5 from the axis minimum to 100. */
const ticks5 = (min: number) => Array.from({ length: Math.floor((100 - min) / 5) + 1 }, (_, i) => min + i * 5);

export function TrendChart({
  points,
  series,
  allSeries,
  kpi,
  height = 280,
}: {
  points: Record<string, string | number | null>[];
  series: string[];
  allSeries: string[];
  kpi: number;
  height?: number;
}) {
  const colorOf = (s: string) => SERIES[Math.max(0, allSeries.indexOf(s)) % SERIES.length];
  const values = points.flatMap((p) => [p.overall, ...series.map((s) => p[s])]).filter((v): v is number => typeof v === "number");
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values, kpi) - 4) / 5) * 5) : 70;
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" tickFormatter={(w: string) => shortDate(w)} tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
            <YAxis domain={[min, 100]} ticks={ticks5(min)} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={48} />
            <ReferenceLine y={kpi} stroke={MUTED} strokeDasharray="4 4" label={{ value: `KPI ${kpi}%`, position: "insideBottomRight", fill: MUTED, fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: GRID, strokeWidth: 1.5 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`w/c ${shortDate(String(label))}`}
                    rows={payload.map((p) => ({ label: String(p.name), value: fmt(p.value), color: String(p.color ?? p.stroke) }))}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line key={s} type="monotone" dataKey={s} name={s} stroke={colorOf(s)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} connectNulls />
            ))}
            <Line type="monotone" dataKey="overall" name="All sites" stroke={INK} strokeWidth={2.5} strokeDasharray="1 0" dot={{ r: 2.5, fill: INK }} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-ink" /> All sites
        </li>
        {series.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: colorOf(s) }} /> {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DistributionChart({ data, height = 220 }: { data: { label: string; count: number; band: string }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: "rgba(0,166,235,0.06)" }} content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: "Calls", value: String(payload[0].value) }]} /> : null)} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={BAND_FILL[d.band]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgentTrendChart({ points, kpi, height = 240 }: { points: { week: string; avg: number | null; count: number }[]; kpi: number; height?: number }) {
  const values = points.map((p) => p.avg).filter((v): v is number => v !== null);
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values, kpi) - 5) / 5) * 5) : 70;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="week" tickFormatter={(w: string) => shortDate(w)} tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis domain={[min, 100]} ticks={ticks5(min)} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={48} />
          <ReferenceLine y={kpi} stroke={MUTED} strokeDasharray="4 4" label={{ value: `KPI ${kpi}%`, position: "insideBottomRight", fill: MUTED, fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: GRID, strokeWidth: 1.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={`w/c ${shortDate(String(label))}`}
                  rows={[
                    { label: "Average", value: fmt(payload[0].value), color: "#00a6eb" },
                    { label: "Calls reviewed", value: String(payload[0].payload.count) },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="avg" stroke="#00a6eb" strokeWidth={2.5} dot={{ r: 3, fill: "#00a6eb", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SectionRadar({ data, height = 260 }: { data: { section: string; agent: number | null; team: number | null }[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, agent: d.agent ?? 0, team: d.team ?? 0 }));
  const min = Math.max(0, Math.floor((Math.min(...rows.flatMap((r) => [r.agent, r.team]).filter((v) => v > 0), 100) - 10) / 10) * 10);
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="72%">
            <PolarGrid stroke={GRID} />
            <PolarAngleAxis dataKey="section" tick={{ fill: INK, fontSize: 12 }} />
            <PolarRadiusAxis domain={[min, 100]} tick={false} axisLine={false} />
            <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox title={String(payload[0].payload.section)} rows={payload.map((p) => ({ label: String(p.name), value: fmt(p.value), color: String(p.color ?? p.stroke) }))} /> : null)} />
            <Radar name="Team" dataKey="team" stroke={MUTED} fill={MUTED} fillOpacity={0.08} strokeDasharray="4 3" />
            <Radar name="Agent" dataKey="agent" stroke="#00a6eb" fill="#00a6eb" fillOpacity={0.22} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Chart range starts at {min}%.</p>
      <ul className="flex justify-center gap-4 text-[12.5px] text-ink-2" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand" /> Agent
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-muted" /> Site average
        </li>
      </ul>
    </div>
  );
}
