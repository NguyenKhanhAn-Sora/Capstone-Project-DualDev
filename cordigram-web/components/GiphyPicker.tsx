"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./GiphyPicker.module.css";
import {
  searchGifs,
  getTrendingGifs,
  searchStickers,
  getTrendingStickers,
  type GiphyGif,
} from "@/lib/giphy-api";

interface GiphyPickerProps {
  onSelect: (gif: GiphyGif, type: "gif" | "sticker") => void;
  onClose: () => void;
  initialTab?: "gif" | "sticker";
}

export default function GiphyPicker({
  onSelect,
  onClose,
  initialTab = "gif",
}: GiphyPickerProps) {
  const [activeTab, setActiveTab] = useState<"gif" | "sticker">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Load trending on mount
  useEffect(() => {
    loadTrending();
  }, [activeTab]);

  // Auto-focus search input
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const loadTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        activeTab === "gif"
          ? await getTrendingGifs(30)
          : await getTrendingStickers(30);
      setGifs(response.data);
    } catch (err) {
      console.error("Failed to load trending:", err);
      setError("Không thể tải nội dung phổ biến");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        loadTrending();
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response =
          activeTab === "gif"
            ? await searchGifs(query, 30)
            : await searchStickers(query, 30);
        setGifs(response.data);
      } catch (err) {
        console.error("Failed to search:", err);
        setError("Không thể tìm kiếm");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, loadTrending],
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleTabChange = (tab: "gif" | "sticker") => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const handleGifClick = (gif: GiphyGif) => {
    onSelect(gif, activeTab);
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.picker} ref={pickerRef}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "gif" ? styles.tabActive : ""}`}
              onClick={() => handleTabChange("gif")}
            >
              🎬 GIF
            </button>
            <button
              className={`${styles.tab} ${activeTab === "sticker" ? styles.tabActive : ""}`}
              onClick={() => handleTabChange("sticker")}
            >
              😊 Sticker
            </button>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchContainer}>
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            placeholder={`Tìm ${activeTab === "gif" ? "GIF" : "sticker"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className={styles.content}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>Đang tải...</p>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <p>{error}</p>
              <button onClick={loadTrending}>Thử lại</button>
            </div>
          )}

          {!loading && !error && gifs.length === 0 && (
            <div className={styles.empty}>
              <p>Không tìm thấy kết quả</p>
            </div>
          )}

          {!loading && !error && gifs.length > 0 && (
            <div className={styles.grid}>
              {gifs.map((gif) => (
                <div
                  key={gif.id}
                  className={styles.gifItem}
                  onClick={() => handleGifClick(gif)}
                >
                  <img
                    src={gif.images.fixed_height_small.url}
                    alt={gif.title}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span>Powered by</span>
          <img
            src="https://developers.giphy.com/branch/master/static/attribution-mark-1a9925c1.png"
            alt="Giphy"
            className={styles.giphyLogo}
          />
        </div>
      </div>
    </div>
  );
}
