"use client";

import Image from "next/image";

export function IconClear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconView() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}

export function formatCount(value?: number) {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

export function HashTile({ className }: { className: string }) {
  return (
    <div className={className} aria-hidden>
      #
    </div>
  );
}

export function toCloudinaryVideoThumbnail(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";

  const [base, query] = raw.split("?");
  const lower = base.toLowerCase();
  const isVideoExt = /\.(mp4|mov|webm|mkv)$/i.test(lower);
  const hasUpload = base.includes("/upload/");
  if (!isVideoExt || !hasUpload) return "";

  const withFrame = base.replace("/upload/", "/upload/so_0/");
  const jpg = withFrame.replace(/\.(mp4|mov|webm|mkv)$/i, ".jpg");
  return query ? `${jpg}?${query}` : jpg;
}

export function PostTile(props: {
  mediaUrl: string;
  mediaType?: "image" | "video" | "";
  classNameTile: string;
  classNameThumb: string;
  classNameGlyph: string;
  classNamePlay: string;
}) {
  const mediaUrl = (props.mediaUrl ?? "").trim();
  const isVideo = props.mediaType === "video";
  const src = isVideo
    ? toCloudinaryVideoThumbnail(mediaUrl) || ""
    : mediaUrl || "";

  return (
    <div className={props.classNameTile} aria-hidden>
      {src ? (
        <Image
          src={src}
          alt=""
          width={56}
          height={56}
          className={props.classNameThumb}
        />
      ) : (
        <div className={props.classNameGlyph}>
          <span>▦</span>
        </div>
      )}
      {isVideo ? <div className={props.classNamePlay}>▶</div> : null}
    </div>
  );
}
