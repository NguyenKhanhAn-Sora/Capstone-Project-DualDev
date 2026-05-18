"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "../payment-status.module.css";

export default function AdsPaymentCancelPage() {
  const t = useTranslations("ads.payment.cancel");

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.subtitle}>{t("subtitle")}</p>

        <div className={styles.actions}>
          <Link className={styles.secondaryBtn} href="/ads">
            {t("backToDashboard")}
          </Link>
          <Link className={styles.primaryBtn} href="/ads/create">
            {t("tryAgain")}
          </Link>
        </div>
      </div>
    </div>
  );
}
