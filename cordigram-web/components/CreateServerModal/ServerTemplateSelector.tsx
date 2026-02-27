"use client";

import React from "react";
import styles from "./ServerTemplateSelector.module.css";
import { type ServerTemplate } from "@/lib/servers-api";

interface ServerTemplateSelectorProps {
  onSelectTemplate: (template: ServerTemplate) => void;
}

const templates = [
  {
    id: "custom" as ServerTemplate,
    name: "Tạo Mẫu Riêng",
    icon: "🎨",
    description: "Tạo máy chủ từ đầu với cài đặt tùy chỉnh",
  },
  {
    id: "gaming" as ServerTemplate,
    name: "Gaming",
    icon: "🎮",
    description: "Chơi game cùng bạn bè",
  },
  {
    id: "friends" as ServerTemplate,
    name: "Bạn bè",
    icon: "💕",
    description: "Trò chuyện với bạn bè thân thiết",
  },
  {
    id: "study-group" as ServerTemplate,
    name: "Nhóm Học Tập",
    icon: "🍎",
    description: "Học tập và hợp tác",
  },
  {
    id: "school-club" as ServerTemplate,
    name: "Câu Lạc Bộ Trường Học",
    icon: "📚",
    description: "Kết nối với câu lạc bộ của bạn",
  },
  {
    id: "local-community" as ServerTemplate,
    name: "Cộng Đồng Địa Phương",
    icon: "🌿",
    description: "Kết nối với cộng đồng địa phương",
  },
  {
    id: "artists-creators" as ServerTemplate,
    name: "Nghệ Sĩ và Người Sáng Tạo",
    icon: "🎨",
    description: "Chia sẻ và thảo luận nghệ thuật",
  },
];

export default function ServerTemplateSelector({
  onSelectTemplate,
}: ServerTemplateSelectorProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Tạo Máy Chủ Của Bạn</h2>
      <p className={styles.subtitle}>
        Máy chủ của bạn là nơi bạn giao lưu với bạn bè của mình.
        <br />
        Hãy tạo máy chủ của riêng bạn và bắt đầu trò chuyện.
      </p>

      <div className={styles.templateList}>
        {templates.map((template, index) => (
          <React.Fragment key={template.id}>
            {index === 1 && (
              <div className={styles.sectionLabel}>BẮT ĐẦU TỪ MẪU</div>
            )}
            <button
              className={styles.templateButton}
              onClick={() => onSelectTemplate(template.id)}
            >
              <span className={styles.templateIcon}>{template.icon}</span>
              <span className={styles.templateName}>{template.name}</span>
              <span className={styles.arrow}>›</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerQuestion}>Bạn đã nhận được lời mời rồi?</p>
        <button className={styles.joinButton}>Tham gia máy chủ</button>
      </div>
    </div>
  );
}
