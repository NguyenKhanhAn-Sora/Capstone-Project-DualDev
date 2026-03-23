import styles from "./verified-badge.module.css";

type VerifiedBadgeProps = {
  visible?: boolean;
  size?: number;
  className?: string;
};

export default function VerifiedBadge(props: VerifiedBadgeProps) {
  const { visible = true, size = 18, className } = props;
  if (!visible) return null;

  return (
    <span
      className={`${styles.badge} ${className ?? ""}`.trim()}
      aria-label="Creator verified"
      title="Creator verified"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="creator-verified-gradient" x1="2" y1="2" x2="18" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#52B6FF" />
            <stop offset="1" stopColor="#1570EF" />
          </linearGradient>
        </defs>
        <path
          d="M10 1.6 12.2 3.1 14.8 3.1 16.1 5.4 18.4 6.8 18.4 9.4 19.9 11.6 18.4 13.8 18.4 16.4 16.1 17.8 14.8 20.1 12.2 20.1 10 21.6 7.8 20.1 5.2 20.1 3.9 17.8 1.6 16.4 1.6 13.8 0.1 11.6 1.6 9.4 1.6 6.8 3.9 5.4 5.2 3.1 7.8 3.1 10 1.6Z"
          transform="scale(0.9) translate(1.1 0.1)"
          fill="url(#creator-verified-gradient)"
        />
        <path
          d="M6.8 10.3 9.1 12.6 13.6 8.1"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
