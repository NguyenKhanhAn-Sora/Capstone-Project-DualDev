import Link from "next/link";
import styles from "./terms.module.css";

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <header className={styles.head}>
          <p className={styles.badge}>Cordigram Legal</p>
          <h1 className={styles.title}>Cordigram Terms and Advertising Policy</h1>
          <p className={styles.subtitle}>
            These terms apply to all users who create content, run ads, and use services on Cordigram.
          </p>
        </header>

        <section className={styles.section}>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By using Cordigram, you agree to follow these terms, related product policies, and applicable laws.
            If you do not agree, do not use Cordigram services.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Account and Responsibility</h2>
          <p>
            You are responsible for all activity under your account, including posts, comments, ads, and payments.
            You must provide accurate account and billing information.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Advertising Rules</h2>
          <p>
            Ads must be lawful, truthful, and must not mislead users. Landing pages and ad creatives must match
            each other and clearly describe the promoted product or service.
          </p>
          <ul className={styles.list}>
            <li>No adult or sexual content (18+), nudity, or sexually suggestive promotion.</li>
            <li>No violent, graphic, or harmful content.</li>
            <li>No promotion of weapons, weapon sales, weapon modification, or weapon-related services.</li>
            <li>No sensitive or exploitative content, including hate, harassment, or discrimination.</li>
            <li>No illegal products, scams, phishing, or deceptive financial offers.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. Payment and Refunds</h2>
          <p>
            Payments are processed by third-party providers such as Stripe. Fees, taxes, and currency conversion may
            apply based on your region and payment method. Approved ad spending is generally non-refundable unless
            required by law or platform error.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. Moderation and Enforcement</h2>
          <p>
            Cordigram may review, limit, reject, pause, or remove content and ads that violate these terms. Repeated
            or severe violations can result in account suspension or permanent restriction.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of Cordigram after updates means you accept the
            revised terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. Contact</h2>
          <p>
            For policy questions, billing support, or legal concerns, contact us at
            <a className={styles.mailLink} href="mailto:cordigram@gmail.com"> cordigram@gmail.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
