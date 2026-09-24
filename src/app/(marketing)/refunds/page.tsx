import type { Metadata } from "next";
import { LegalPage } from "../legal/content";

export const metadata: Metadata = {
  title: "Refund policy",
  description:
    "Monthly plans aren't refundable. Annual plans can be refunded for the months you haven't started.",
};

/**
 * Keep this page and src/lib/billing/refund.ts saying the same thing — the
 * code is what staff use to work out every refund. See docs/BILLING.md §Refunds.
 */
export default function RefundsPage() {
  return (
    <LegalPage title="Refund policy" updated="September 2026">
      <p>
        In short: <strong>monthly plans aren&rsquo;t refundable</strong>, and{" "}
        <strong>annual plans can be refunded for the months you haven&rsquo;t started</strong>{" "}
        — just email us.
      </p>

      <h2>Monthly plans</h2>
      <p>
        Monthly plans are paid at the start of each month and are not refundable, in full or in
        part. You can cancel at any time from the billing page: you keep your plan until the end of
        the month you&rsquo;ve paid for, and you won&rsquo;t be charged again.
      </p>

      <h2>Annual plans</h2>
      <p>
        Annual plans are paid for the whole year up front and renew automatically each year. If
        you no longer want your plan, you can ask for a refund at any point during the year, and
        we&rsquo;ll refund the months that haven&rsquo;t started yet:
      </p>
      <ul>
        <li>Months are counted from the date your plan&rsquo;s year began.</li>
        <li>
          The month you&rsquo;re in when your request reaches us counts as used, along with every
          month before it.
        </li>
        <li>
          The refund is what you paid for the year, including any tax, divided by twelve, for each
          month that hasn&rsquo;t started.
        </li>
      </ul>
      <p>
        For example: you paid $190 for a year of Pro and write to us two months and ten days in.
        Three months have started, so nine are refunded — $190 &times; 9 &divide; 12 ={" "}
        <strong>$142.50</strong>.
      </p>
      <p>
        When the refund is issued your plan ends straight away and your workspace moves to the Free
        plan. Nothing you built is deleted: automations that use features Free doesn&rsquo;t
        include pause at that step, and resume if you upgrade again.
      </p>
      <p>
        The same applies just after a renewal. We email you a week before an annual plan renews;
        if it renews and you change your mind, ask us and the unstarted months are refunded.
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

      <h2>Charged by mistake?</h2>
      <p>
        This policy is about changing your mind. If you were charged in error — a duplicate
        charge, or a charge after you cancelled — email us on either plan and we&rsquo;ll put it
        right.
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
