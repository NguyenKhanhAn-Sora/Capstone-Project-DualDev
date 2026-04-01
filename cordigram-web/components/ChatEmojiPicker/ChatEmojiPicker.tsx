"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import styles from "./ChatEmojiPicker.module.css";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Đang tải...</div>,
});

const KAOMOJI_CATEGORIES = [
  {
    "label": "Vui / Phấn khích",
    "items": [
      "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
      "(*^▽^*)",
      "(≧◡≦)",
      "ヽ(•‿•)ﾉ",
      "(*≧▽≦)",
      "(´･ω･`)",
      "(•‿•)",
      "(＾▽＾)"
    ]
  },
  {
    "label": "Yêu thương",
    "items": [
      "(♡˙︶˙♡)",
      "(ˆ ³ˆ)♥",
      "( ˘ ³˘)♥",
      "(●´ω｀●)",
      "(˘ε˘)",
      "(｡♥‿♥｡)",
      "(づ｡◕‿‿◕｡)づ"
    ]
  },
  {
    "label": "Buồn / Khóc",
    "items": [
      "(╥_╥)",
      "(T_T)",
      "(；′⌒｀)",
      "ಥ_ಥ",
      "(｡•́︿•̀｡)",
      "(╯︵╰,)"
    ]
  },
  {
    "label": "Ngạc nhiên",
    "items": [
      "(⊙_⊙)",
      "(°o°)",
      "Σ(°△°|||)",
      "(°ロ°) !!",
      "ヽ(゜凳。)ノ？"
    ]
  },
  {
    "label": "Tức giận",
    "items": [
      "(╯°□°）╯︵ ┻━┻",
      "(≖＿≖✿)",
      "ψ(｀∇´)ψ",
      "(ノ｀Д´)ノ",
      "( ｀ー´)"
    ]
  },
  {
    "label": "Hài hước",
    "items": [
      "( ͡° ͜ʖ ͡°)",
      "¯\\_(ツ)_/¯",
      "ʕ•ᴥ•ʔ",
      "(งʼ̀-ʼ́)ง",
      "(ง •̀_•́)ง"
    ]
  },
  {
    "label": "Chào / Vẫy",
    "items": [
      "( ´ ▽ ` )ﾉ",
      "(*ﾟ▽ﾟ*)/",
      "(＾ゞ^)",
      "ヾ(^∇^)",
      "o(^▽^)o"
    ]
  },
  {
    "label": "Ngủ / Mệt",
    "items": [
      "(－_－) zzZ",
      "( ˘ω˘ ) zzZ",
      "(∪｡∪)｡｡｡zzZ",
      "(-ω-)zZ",
      "(´-ω-`)"
    ]
  }
];

interface ChatEmojiPickerProps {
  onSelect: (text: string) => void;
  onClose: () => void;
  position?: "top" | "bottom";
}

type Tab = "emoji" | "kaomoji";

export default function ChatEmojiPicker({ onSelect, onClose, position = "top" }: ChatEmojiPickerProps) {
  const [tab, setTab] = useState<Tab>("emoji");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className={`${styles.container} ${position === "bottom" ? styles.posBottom : styles.posTop}`}>
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === "emoji" ? styles.tabActive : ""}`} onClick={() => setTab("emoji")}>
          😀 Emoji
        </button>
        <button type="button" className={`${styles.tab} ${tab === "kaomoji" ? styles.tabActive : ""}`} onClick={() => setTab("kaomoji")}>
          (˶˃ ᵕ ˂˶)
        </button>
      </div>

      {tab === "emoji" && (
        <div className={styles.martWrap}>
          <EmojiPicker
            onEmojiClick={(emojiData: any) => {
              onSelect(emojiData?.emoji ?? "");
              onClose();
            }}
            autoFocusSearch={false}
            lazyLoadEmojis
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
            height={360}
            width="100%"
          />
        </div>
      )}

      {tab === "kaomoji" && (
        <div className={styles.kaomojiPanel}>
          {KAOMOJI_CATEGORIES.map((cat) => (
            <div key={cat.label} className={styles.kaoCategory}>
              <div className={styles.kaoCategoryLabel}>{cat.label}</div>
              <div className={styles.kaoGrid}>
                {cat.items.map((k) => (
                  <button key={k} type="button" className={styles.kaoItem} onClick={() => { onSelect(k); onClose(); }} title={k}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
