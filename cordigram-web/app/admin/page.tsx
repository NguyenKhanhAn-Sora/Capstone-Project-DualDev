import Link from "next/link";
import styles from "./admin.module.css";

export default function AdminPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.badge}>Admin Portal</div>
        <h1 className={styles.title}>Cordigram Admin</h1>
        <p className={styles.subtitle}>
          This area is reserved for staff tools and moderation workflows.
        </p>
        <div className={styles.actions}>
          <Link href="/admin/login" className={styles.primaryButton}>
            Go to Login
          </Link>
          <Link href="/" className={styles.secondaryButton}>
            Back to Cordigram
          </Link>
        </div>
      </div>
    </div>
  );
}
