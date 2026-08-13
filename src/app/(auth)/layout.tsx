import { PhoneDemo } from "@/components/marketing/phone-demo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center">{children}</div>

      {/* Aside: the same demo from the landing page, so the promise stays in view. */}
      <aside className="relative hidden items-center justify-center overflow-hidden border-l border-[var(--border)] bg-[var(--bg-subtle)] p-10 lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="grid-bg radial-fade absolute inset-0" />
          <div className="absolute -right-24 top-10 h-[420px] w-[420px] rounded-full bg-[var(--color-zap-500)] opacity-[0.12] blur-[110px]" />
          <div className="absolute -left-20 bottom-0 h-[380px] w-[380px] rounded-full bg-[var(--color-kapow-400)] opacity-[0.12] blur-[110px]" />
        </div>

        <div className="relative w-full max-w-sm">
          <PhoneDemo />
          <p className="mt-8 text-center text-[14px] leading-relaxed text-[var(--text-muted)]">
            A comment comes in. A DM goes out.
            <br />
            <span className="text-[var(--text)]">Roughly 1.2 seconds later.</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
