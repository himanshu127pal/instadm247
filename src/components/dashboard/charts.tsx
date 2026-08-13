"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Charts.
 *
 * Palette: categorical slots 1–4 of the validated default ramp, stepped
 * separately for the dark surface. Verified with the dataviz validator against
 * both surfaces — all checks pass; light mode raises a contrast warning on the
 * aqua and yellow slots, which is why every chart here ships a table view and a
 * legend rather than relying on colour alone.
 */

const SERIES = [
  { key: "triggered", label: "Triggered", light: "#2a78d6", dark: "#3987e5" },
  { key: "sent", label: "Sent", light: "#eb6834", dark: "#d95926" },
  { key: "opened", label: "Opened", light: "#1baf7a", dark: "#199e70" },
  { key: "clicked", label: "Clicked", light: "#eda100", dark: "#c98500" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];
export type ActivityPoint = { date: string } & Record<SeriesKey, number>;

/** Track the resolved theme so chart colours match the surface they sit on. */
function useIsDark(): boolean {
  const [dark, setDark] = React.useState(true);

  React.useEffect(() => {
    const resolve = () => {
      const stamped = document.documentElement.getAttribute("data-theme");
      if (stamped === "dark") return true;
      if (stamped === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    setDark(resolve());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => setDark(resolve());
    media.addEventListener("change", onMedia);

    const observer = new MutationObserver(() => setDark(resolve()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      media.removeEventListener("change", onMedia);
      observer.disconnect();
    };
  }, []);

  return dark;
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const isDark = useIsDark();
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const colorOf = (s: (typeof SERIES)[number]) => (isDark ? s.dark : s.light);

  const hasData = data.some((point) => SERIES.some((s) => point[s.key] > 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legend — always present for ≥2 series, so identity is never colour alone */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: colorOf(series) }}
                aria-hidden
              />
              <span className="text-[12px] text-[var(--text-muted)]">{series.label}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
          {(
            [
              { id: "chart", icon: BarChart3, label: "Chart view" },
              { id: "table", icon: Table2, label: "Table view" },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => setView(option.id)}
                aria-label={option.label}
                aria-pressed={view === option.id}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-colors",
                  view === option.id
                    ? "bg-[var(--bg-sunken)] text-[var(--text)]"
                    : "text-[var(--text-faint)] hover:text-[var(--text)]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      {!hasData ? (
        <div className="grid h-[260px] place-items-center rounded-xl border-[2.5px] border-dashed border-[var(--border)]">
          <p className="text-[13px] text-[var(--text-muted)]">
            No activity yet — this fills in as your automations run.
          </p>
        </div>
      ) : view === "table" ? (
        <ActivityTable data={data} />
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                {SERIES.map((series) => (
                  <linearGradient
                    key={series.key}
                    id={`fill-${series.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={colorOf(series)} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={colorOf(series)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={{ fill: "var(--text-faint)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--text-faint)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(value: number) => formatNumber(value)}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                content={<ChartTooltip isDark={isDark} />}
              />

              {SERIES.map((series) => (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={colorOf(series)}
                  strokeWidth={2}
                  fill={`url(#fill-${series.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg)" }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  isDark,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>;
  label?: string;
  isDark: boolean;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 shadow-lift">
      <p className="mb-1.5 text-[11px] font-medium text-[var(--text-faint)]">
        {label ? formatDay(label) : ""}
      </p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const series = SERIES.find((s) => s.key === entry.dataKey);
          return (
            <li key={entry.dataKey} className="flex items-center gap-2 text-[12px]">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: series ? (isDark ? series.dark : series.light) : undefined }}
                aria-hidden
              />
              <span className="flex-1 text-[var(--text-muted)]">{entry.name}</span>
              <span className="font-medium tabular-nums">
                {(entry.value ?? 0).toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActivityTable({ data }: { data: ActivityPoint[] }) {
  const rows = [...data].reverse();

  return (
    <div className="max-h-[260px] overflow-auto rounded-xl border-2 border-[var(--border)]">
      <table className="w-full text-left text-[12.5px]">
        <thead className="sticky top-0 bg-[var(--bg-sunken)]">
          <tr>
            <th className="px-3 py-2 font-medium text-[var(--text-muted)]">Day</th>
            {SERIES.map((series) => (
              <th
                key={series.key}
                className="px-3 py-2 text-right font-medium text-[var(--text-muted)]"
              >
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date} className="border-t-2 border-[var(--border-soft)]">
              <td className="px-3 py-1.5">{formatDay(row.date)}</td>
              {SERIES.map((series) => (
                <td key={series.key} className="px-3 py-1.5 text-right tabular-nums">
                  {row[series.key].toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Flow funnel: how many runs reached each step. A single measure, so one hue —
 * magnitude is carried by bar length, and each bar is directly labelled.
 */
export function FunnelChart({
  nodes,
  totalRuns,
}: {
  nodes: Array<{ nodeId: string; nodeType: string; entered: number; rate: number }>;
  totalRuns: number;
}) {
  if (nodes.length === 0 || totalRuns === 0) {
    return (
      <div className="grid h-[180px] place-items-center rounded-xl border-[2.5px] border-dashed border-[var(--border)]">
        <p className="text-[13px] text-[var(--text-muted)]">
          Once this automation runs, you&rsquo;ll see where people drop off.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {nodes.map((node, i) => {
        const percent = Math.round(node.rate * 100);
        const dropped = i > 0 ? nodes[i - 1].entered - node.entered : 0;

        return (
          <li key={node.nodeId}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-medium">
                {prettyNodeType(node.nodeType)}
              </span>
              <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
                {node.entered.toLocaleString()}
                <span className="ml-1.5 text-[var(--text-faint)]">{percent}%</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(percent, 1.5)}%`,
                  backgroundColor: "var(--accent)",
                }}
              />
            </div>
            {dropped > 0 && (
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                {dropped.toLocaleString()} didn&rsquo;t reach this step
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function prettyNodeType(type: string): string {
  const map: Record<string, string> = {
    TRIGGER: "Triggered",
    SEND_MESSAGE: "Message sent",
    REPLY_TO_COMMENT: "Public reply",
    DELAY: "Waited",
    CONDITION: "Branched",
    ASK_FOR_FOLLOW: "Asked for follow",
    FOLLOWER_CHECK: "Follower check",
    COLLECT_INPUT: "Asked a question",
    AI_REPLY: "AI replied",
    TAG: "Tagged",
    SET_FIELD: "Field set",
    RANDOMIZER: "Split test",
    HTTP_REQUEST: "Webhook called",
    HUMAN_HANDOFF: "Handed to human",
    END: "Finished",
  };
  return map[type] ?? type;
}

/* -------------------------------------------------------------------------- */

/** Why sends were skipped — one categorical measure, direct-labelled. */
export function SkipReasonChart({
  data,
}: {
  data: Array<{ reason: string; count: number; label: string }>;
}) {
  const isDark = useIsDark();

  if (data.length === 0) {
    return (
      <div className="grid h-[160px] place-items-center rounded-xl border-[2.5px] border-dashed border-[var(--border)]">
        <p className="text-[13px] text-[var(--text-muted)]">
          Nothing was skipped in this period. That&rsquo;s the good outcome.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fill: "var(--text-muted)", fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--bg-sunken)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-1.5 text-[12px] shadow-lift">
                  {(payload[0].value as number).toLocaleString()} skipped
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((entry) => (
              <Cell key={entry.reason} fill={isDark ? "#3987e5" : "#2a78d6"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
