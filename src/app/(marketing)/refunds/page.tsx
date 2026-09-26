import type { Metadata } from "next";
import { LegalPage } from "../legal/content";
import { PLANS } from "@/lib/billing/plans";

const PRO = PLANS.pro.price!;
const BUSINESS = PLANS.business.price!;
const back = (price: { month: number; year: number }, used: number) =>
  `$${Math.max(0, price.year - used * price.month)} back`;
/** The first month count at which nothing is left: 10 while annual is "two months free". */
const EXHAUSTED = Math.ceil(PRO.year / PRO.month);

export const metadata: Metadata = {
  title: "Refund policy",
  description:
    "Monthly plans aren't refundable. Annual plans can be refunded, less the months used at the monthly price.",
};

/**
 * Keep this page and src/lib/billing/refund.ts saying the same thing — the
 * code is what staff use to work out every refund, and the table below uses
 * the prices in src/lib/billing/plans.ts. See docs/BILLING.md §Refunds.
 */
export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="September 2026">
      <p>
        In short: <strong>monthly plans aren&rsquo;t refundable</strong>. On an{" "}
        <strong>annual plan</strong> you can ask for a refund during the year: we charge the months
        you&rsquo;ve used at the regular monthly price and refund the rest of what you paid.
      </p>

      <h2>Monthly plans</h2>
      <p>
        Monthly plans are paid at the start of each month and are not refundable, in full or in
        part. You can cancel at any time from the billing page: you keep your plan until the end of
        the month you&rsquo;ve paid for, and you won&rsquo;t be charged again.
      </p>

      <h2>Annual plans</h2>
      <p>
        Annual plans are paid for the whole year up front, at a discount (two months free), and
        renew automatically once a year. If you no longer want your plan, you can ask for a refund
        at any point during the year:
      </p>
      <ul>
        <li>
          The months you&rsquo;ve used are charged at the plan&rsquo;s regular{" "}
          <strong>monthly</strong> price, not the discounted annual rate. The month you&rsquo;re in
          when your request reaches us counts as used, along with every month before it.
        </li>
        <li>
          We refund the yearly price minus those months. Any tax you paid is refunded in the same
          proportion.
        </li>
        <li>
          Because the annual price already includes the discount, once {EXHAUSTED} months have
          been used there is nothing left to refund.
        </li>
      </ul>
      <p>
        {`For example, Pro is $${PRO.month} a month or $${PRO.year} a year. You pay $${PRO.year} and write to us two months and ten days in: three months have started, so they're charged at $${PRO.month} each and you get back $${PRO.year} − $${3 * PRO.month} = `}
        <strong>{`$${PRO.year - 3 * PRO.month}`}</strong>.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[var(--border-soft)] text-[var(--text)]">
              <th className="py-1.5 pr-4 font-semibold">Months used</th>
              <th className="py-1.5 pr-4 font-semibold">Pro (${PRO.year}/year)</th>
              <th className="py-1.5 font-semibold">Business (${BUSINESS.year}/year)</th>
            </tr>
          </thead>
          <tbody>
            {[1, 3, 6, 9, EXHAUSTED].map((used) => (
              <tr key={used} className="border-b border-[var(--border-soft)]">
                <td className="py-1.5 pr-4">{used === EXHAUSTED ? `${used} or more` : used}</td>
                <td className="py-1.5 pr-4">{back(PRO, used)}</td>
                <td className="py-1.5">{back(BUSINESS, used)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        When the refund is issued your plan ends straight away and your workspace moves to the Free
        plan. Nothing you built is deleted: automations that use features Free doesn&rsquo;t
        include pause at that step, and resume if you upgrade again.
      </p>
      <p>
        The same applies just after a renewal. We email you a week before an annual plan renews, so
        you can cancel first if you don&rsquo;t want another year.
      </p>

      <h2>No other refunds</h2>
      <p>
        Apart from the annual-plan refund above, payments are not refundable. That includes monthly
        payments, partial months, and allowances you didn&rsquo;t use.
      </p>

      <h2>How to ask for a refund</h2>
      <p>
        Email <strong>support@instadm247.com</strong> from the email address of the account that
        owns the workspace, and tell us which workspace it&rsquo;s for. We&rsquo;ll reply to
        confirm the amount once it&rsquo;s issued.
      </p>

      <h2>How you get the money back</h2>
      <p>
        Payments are processed by Dodo Payments, our merchant of record, so refunds are issued
        through Dodo to the payment method you paid with, in the currency you paid in. How long it
        takes to appear depends on your bank or card issuer.
      </p>

      <h2>Your rights</h2>
      <p>
        Nothing in this policy limits any rights you have under the consumer law of the country
        you live in.
      </p>

      <h2>Contact</h2>
      <p>
        <strong>support@instadm247.com</strong>
      </p>
      <p>
        InstaDM247 is the registered trade name of Rajat Pal, a proprietorship registered in
        India. Registered address: 79, Unnamed Road, Near Pablikhas Railway Station, Modi Puram,
        Meerut, Meerut, Uttar Pradesh, 250110, India. GSTIN: 09CVWPP3468C1ZX.
      </p>
    </LegalPage>
  );
}
