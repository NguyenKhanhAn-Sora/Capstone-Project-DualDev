import Link from "next/link";
import styles from "../payment-status.module.css";

export default function AdsPaymentCancelPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Payment Canceled</h1>
        <p className={styles.subtitle}>
          You canceled Stripe checkout. Your ad campaign has not been charged yet.
        </p>

        <div className={styles.actions}>
          <Link className={styles.secondaryBtn} href="/ads">
            Back to Ads dashboard
          </Link>
          <Link className={styles.primaryBtn} href="/ads/create">
            Try payment again
          </Link>
        </div>
      </div>
    </div>
  );
}
