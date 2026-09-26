import type { Metadata } from "next";
import { LegalPage } from "../legal/content";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="September 2026">
      <p>
        These terms govern your use of InstaDM247. Using the service means you agree to
        them.
      </p>

      <h2>What you need</h2>
      <p>
        An Instagram professional account (Business or Creator) that you own or are
        authorised to manage. You must be old enough to enter a contract where you live.
      </p>

      <h2>Acceptable use</h2>
      <p>
        InstaDM247 is built to keep you inside Meta&rsquo;s rules, and you agree not to
        work around that. Specifically, you will not:
      </p>
      <ul>
        <li>Send unsolicited, deceptive, or harassing messages.</li>
        <li>
          Misrepresent who you are, or automate messages that a recipient would reasonably
          believe came from a human when they did not.
        </li>
        <li>Use the service to distribute malware, scams, or illegal content.</li>
        <li>
          Attempt to bypass the messaging window, rate limits, opt-out handling or any
          other safety control in the product.
        </li>
        <li>Automate accounts you do not have permission to manage.</li>
      </ul>
      <p>
        You must also comply with Instagram&rsquo;s Terms of Use and Meta&rsquo;s Platform
        Terms. Breaking those can get your Instagram account restricted by Meta regardless
        of anything we do.
      </p>

      <h2>Your content</h2>
      <p>
        You own the messages, flows and media you create. You grant us only the licence
        needed to store and transmit them to deliver the service.
      </p>

      <h2>Plans and payment</h2>
      <p>
        You can use InstaDM247 on the free plan, or buy a paid plan. Paid plans are sold
        through Dodo Payments, which acts as our merchant of record: it is the seller on
        your receipt, and it collects and remits any sales tax, VAT or GST that applies
        where you are.
      </p>
      <p>
        Paid plans renew automatically each month or year until you cancel. You can cancel
        at any time from the billing page, and you keep your plan until the end of the
        period you have paid for. Usage allowances (automated DMs and AI replies) reset
        on the first day of each calendar month (UTC) and do not roll over. Messages you
        type yourself in the inbox are never counted against them.
      </p>
      <p>
        If you move to a plan that doesn&rsquo;t include a feature you were using, nothing
        you built is deleted: automations that rely on it pause at that step, and resume if
        you upgrade again.
      </p>
      <p>
        Monthly plans are not refundable. Annual plans can be refunded on request, less the
        months used charged at the monthly price. No other payments are refundable. The full
        rules, and how to ask, are in our{" "}
        <a href="/refunds" className="text-[var(--accent)] underline">
          refund policy
        </a>
        .
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep the service running, but we depend on the Instagram API. Meta can
        change, throttle, or withdraw access at any time, and outages there will affect
        delivery here. We provide the service &ldquo;as is&rdquo; without warranties.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect or consequential
        losses, including lost sales, lost followers, or actions Meta takes against your
        Instagram account. Our total liability is capped at the amount you paid us in the
        twelve months before the claim.
      </p>

      <h2>Ending the agreement</h2>
      <p>
        You can stop using the service and delete your data at any time. We may suspend an
        account that breaches these terms or that puts our Meta platform access at risk.
      </p>

      <h2>Changes</h2>
      <p>
        We&rsquo;ll post material changes here and, where they affect you meaningfully,
        tell you before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        <strong>support@instadm247.com</strong>
      </p>
      <p>
        InstaDM247 is the registered trade name of Rajat Pal, a proprietorship registered
        in India. Registered address: 79, Unnamed Road, Near Pablikhas Railway Station,
        Modi Puram, Meerut, Meerut, Uttar Pradesh, 250110, India. GSTIN: 09CVWPP3468C1ZX.
      </p>
    </LegalPage>
  );
}
