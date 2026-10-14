"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Field, Input, Select, Switch } from "@/components/ui";
import { SectionCard } from "@/components/dashboard/bits";
import { BIO_FONTS, BIO_PRESETS, contrastRatio, isCustomised, type BioDesign, type BioFont } from "@/lib/bio-design";
import { cn } from "@/lib/utils";
import { PresetSwatch, type BioDraft } from "./shared";

type Update = (changes: Partial<BioDraft> | ((d: BioDraft) => Partial<BioDraft>)) => void;

export function DesignPanel({ draft, update }: { draft: BioDraft; update: Update }) {
  const d = draft.design;
  const set = (changes: Partial<BioDesign>) => update((x) => ({ design: { ...x.design, ...changes } }));
  const customised = isCustomised(draft.theme, d);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Theme"
        description={
          customised
            ? `Started from ${BIO_PRESETS.find((p) => p.id === draft.theme)?.label ?? "a theme"}, with your changes. Picking a theme replaces your colours, fonts and styles.`
            : "A ready-made look. Change any part of it below."
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {BIO_PRESETS.map((p) => (
            <PresetSwatch
              key={p.id}
              id={p.id}
              label={p.label}
              active={draft.theme === p.id && !customised}
              onClick={() =>
                // Your pictures stay; the look is replaced.
                update((x) => ({ theme: p.id, design: { ...p.design, coverUrl: x.design.coverUrl, bgImageUrl: x.design.bgImageUrl, showShare: x.design.showShare } }))
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Header">
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["minimal", "Minimal", "Small picture, centred"],
              ["banner", "Banner", "A cover image across the top"],
              ["portrait", "Portrait", "Your photo, big"],
            ] as const
          ).map(([id, label, hint]) => (
            <Choice key={id} active={d.header === id} onClick={() => set({ header: id })} label={label} hint={hint}>
              <HeaderSketch kind={id} />
            </Choice>
          ))}
        </div>
        {d.header === "banner" && (
          <Field label="Cover image link" hint="A wide image looks best. Leave empty for a colour band." className="mt-4">
            <Input value={d.coverUrl ?? ""} onChange={(e) => set({ coverUrl: e.target.value.trim() || null })} placeholder="https://…" />
          </Field>
        )}
        {d.header === "portrait" && (
          <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">Uses your profile picture. A photo of you works better than a logo here.</p>
        )}
      </SectionCard>

      {d.header !== "portrait" && (
        <SectionCard title="Profile picture">
          <div className="space-y-4">
            <div className="flex gap-3">
              <Pill active={d.avatarShape === "circle"} onClick={() => set({ avatarShape: "circle" })}>
                <span className="h-4 w-4 rounded-full bg-current" /> Circle
              </Pill>
              <Pill active={d.avatarShape === "rounded"} onClick={() => set({ avatarShape: "rounded" })}>
                <span className="h-4 w-4 rounded-[4px] bg-current" /> Rounded square
              </Pill>
            </div>
            <Slider label="Size" value={d.avatarSize} min={64} max={160} unit="px" onChange={(v) => set({ avatarSize: v })} />
            <Toggle label="Outline" checked={d.avatarOutline} onChange={(v) => set({ avatarOutline: v })} />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Background">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["solid", "gradient", "image"] as const).map((t) => (
              <Pill key={t} active={d.bgType === t} onClick={() => set({ bgType: t })}>
                {t === "solid" ? "Solid" : t === "gradient" ? "Gradient" : "Image"}
              </Pill>
            ))}
          </div>
          {d.bgType === "gradient" && (
            <div className="flex flex-wrap gap-2">
              {(["linear", "radial", "diagonal"] as const).map((g) => (
                <Pill key={g} active={d.gradient === g} onClick={() => set({ gradient: g })}>
                  <span
                    className="h-4 w-6 rounded-[4px] border border-[var(--border)]"
                    style={{
                      background:
                        g === "radial"
                          ? `radial-gradient(circle at 50% 0%, ${d.bgStart}, ${d.bgEnd})`
                          : `linear-gradient(${g === "diagonal" ? "135deg" : "180deg"}, ${d.bgStart}, ${d.bgEnd})`,
                    }}
                  />
                  {g === "linear" ? "Top to bottom" : g === "radial" ? "From the top" : "Diagonal"}
                </Pill>
              ))}
            </div>
          )}
          {d.bgType === "image" && (
            <Field label="Background image link" hint="Your page colour is laid over it lightly so the words stay readable.">
              <Input value={d.bgImageUrl ?? ""} onChange={(e) => set({ bgImageUrl: e.target.value.trim() || null })} placeholder="https://…" />
            </Field>
          )}
          <Toggle label="Comic halftone dots" checked={d.pattern === "halftone"} onChange={(v) => set({ pattern: v ? "halftone" : "none" })} />
        </div>
      </SectionCard>

      <SectionCard title="Colours">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Page</p>
            <ColorRow label={d.bgType === "gradient" ? "Background start" : "Background"} value={d.bgStart} onChange={(v) => set({ bgStart: v })} />
            {d.bgType === "gradient" && <ColorRow label="Background end" value={d.bgEnd} onChange={(v) => set({ bgEnd: v })} />}
            <ColorRow label="Text" value={d.text} onChange={(v) => set({ text: v })} />
          </div>
          <div>
            <p className="mb-1 mt-3 text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)] sm:mt-0">Blocks</p>
            <ColorRow label="Background" value={d.blockBg} onChange={(v) => set({ blockBg: v })} />
            <ColorRow label="Text and outline" value={d.blockText} onChange={(v) => set({ blockText: v })} />
            <ColorRow label="Button" value={d.accent} onChange={(v) => set({ accent: v })} />
            <ColorRow label="Button icon" value={d.accentText} onChange={(v) => set({ accentText: v })} />
            <ColorRow label="Shadow" value={d.shadow} onChange={(v) => set({ shadow: v })} />
          </div>
        </div>
        <ReadabilityWarnings design={d} />
      </SectionCard>

      <SectionCard title="Fonts">
        <div className="grid gap-4 sm:grid-cols-2">
          <FontSelect label="Name and headings" value={d.displayFont} onChange={(v) => set({ displayFont: v })} />
          <FontSelect label="Everything else" value={d.bodyFont} onChange={(v) => set({ bodyFont: v })} />
          <div>
            <p className="mb-1.5 text-[13px] font-extrabold">Name size</p>
            <div className="flex gap-2">
              {(["sm", "md", "lg"] as const).map((s) => (
                <Pill key={s} active={d.titleSize === s} onClick={() => set({ titleSize: s })}>
                  {s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Block style">
        <div className="space-y-4">
          <Slider label="Corner radius" value={d.radius} min={0} max={32} unit="px" onChange={(v) => set({ radius: v })} />
          <Slider label="See-through" value={d.transparency} min={0} max={80} unit="%" onChange={(v) => set({ transparency: v })} />
          <Toggle label="Shadow" checked={d.blockShadow} onChange={(v) => set({ blockShadow: v })} />
          <Toggle label="Outline" hint="With a shadow too, blocks get the comic press-in effect." checked={d.blockOutline} onChange={(v) => set({ blockOutline: v })} />
        </div>
      </SectionCard>
    </div>
  );
}

// --- Controls ---------------------------------------------------------------

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-[13px] font-bold transition-colors",
        active ? "border-[var(--border)] bg-[var(--color-pow-400)] text-[#12110e] shadow-[2px_2px_0_0_var(--shadow-ink)]" : "border-[var(--border-soft)] hover:border-[var(--border)]",
      )}
    >
      {children}
    </button>
  );
}

function Choice({ active, onClick, label, hint, children }: { active: boolean; onClick: () => void; label: string; hint: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-2xl border-2 p-2 text-left transition-transform hover:-translate-y-0.5",
        active ? "border-[var(--border)] bg-[var(--bg-sunken)] shadow-[3px_3px_0_0_var(--shadow-ink)]" : "border-[var(--border-soft)]",
      )}
    >
      {children}
      <span className="mt-2 block text-[13px] font-extrabold">{label}</span>
      <span className="block text-[11.5px] leading-snug text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}

function HeaderSketch({ kind }: { kind: "minimal" | "banner" | "portrait" }) {
  const bar = "h-2.5 w-full rounded bg-[var(--text-faint)]/40";
  return (
    <span className="flex h-24 flex-col items-center gap-1.5 overflow-hidden rounded-xl bg-[var(--bg-sunken)] px-3 pb-2">
      {kind === "minimal" && (
        <>
          <span className="mt-3 h-7 w-7 rounded-full bg-[var(--text-faint)]/60" />
          <span className="h-1.5 w-10 rounded bg-[var(--text-faint)]/70" />
        </>
      )}
      {kind === "banner" && (
        <>
          <span className="-mx-3 h-8 w-[calc(100%+1.5rem)] bg-[var(--text-faint)]/35" />
          <span className="-mt-4 h-7 w-7 rounded-full border-2 border-[var(--bg-sunken)] bg-[var(--text-faint)]/60" />
        </>
      )}
      {kind === "portrait" && (
        <>
          <span className="-mx-3 h-12 w-[calc(100%+1.5rem)] bg-gradient-to-b from-[var(--text-faint)]/60 to-transparent" />
          <span className="-mt-3 h-1.5 w-10 rounded bg-[var(--text-faint)]/70" />
        </>
      )}
      <span className={bar} />
      <span className={bar} />
    </span>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex justify-between text-[13px] font-extrabold">
        {label}
        <span className="font-bold tabular-nums text-[var(--text-muted)]">
          {value}
          {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-kapow-500,#ff5d73)]"
      />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
      <span>
        <span className="block text-[13px] font-bold">{label}</span>
        {hint && <span className="block text-[11.5px] text-[var(--text-muted)]">{hint}</span>}
      </span>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setText(value)}
          aria-label={`${label} colour code`}
          className="h-8 w-[92px] font-mono text-[12px]"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-8 w-8 cursor-pointer rounded-full border-2 border-[var(--border)] bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
      </span>
    </div>
  );
}

function FontSelect({ label, value, onChange }: { label: string; value: BioFont; onChange: (v: BioFont) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as BioFont)} style={{ fontFamily: BIO_FONTS[value].css }}>
        {(Object.entries(BIO_FONTS) as Array<[BioFont, (typeof BIO_FONTS)[BioFont]]>).map(([id, f]) => (
          <option key={id} value={id}>
            {f.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Pairs people have to read, below WCAG's 3:1 for large text. */
function ReadabilityWarnings({ design: d }: { design: BioDesign }) {
  const pairs: Array<[string, string, string]> = [
    ["Page text on the background", d.text, d.bgStart],
    ...(d.bgType === "gradient" ? ([["Page text where the gradient ends", d.text, d.bgEnd]] as Array<[string, string, string]>) : []),
    ["Block text on the block", d.blockText, d.blockBg],
    ["Button icon on the button", d.accentText, d.accent],
  ];
  const hard = pairs.filter(([, a, b]) => contrastRatio(a, b) < 3);
  if (hard.length === 0) return null;
  return (
    <div className="mt-3 flex gap-2 rounded-xl border-2 border-[var(--color-pow-400)] bg-[var(--color-pow-400)]/15 p-3 text-[12.5px]">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-pow-500,#e0a800)]" />
      <span>
        <span className="font-bold">Hard to read: </span>
        {hard.map(([label]) => label.toLowerCase()).join(", ")}. Try a darker or lighter colour.
      </span>
    </div>
  );
}
