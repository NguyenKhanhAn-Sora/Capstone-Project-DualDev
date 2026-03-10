"use client";

import React, { useState } from "react";
import styles from "./CreateServerModal.module.css";
import ServerTemplateSelector from "./ServerTemplateSelector";
import ServerPurposeSelector from "./ServerPurposeSelector";
import ServerCustomization from "./ServerCustomization";
import { createServer, type ServerTemplate, type ServerPurpose } from "@/lib/servers-api";

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated?: (serverId: string) => void;
}

type Step = "template" | "purpose" | "customize";

export default function CreateServerModal({
  isOpen,
  onClose,
  onServerCreated,
}: CreateServerModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<ServerTemplate | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<ServerPurpose | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleTemplateSelect = (template: ServerTemplate) => {
    setSelectedTemplate(template);
    if (template === "custom") {
      // Skip purpose step for custom template
      setCurrentStep("customize");
    } else {
      setCurrentStep("purpose");
    }
  };

  const handlePurposeSelect = (purpose: ServerPurpose) => {
    setSelectedPurpose(purpose);
    setCurrentStep("customize");
  };

  const handleBack = () => {
    if (currentStep === "customize") {
      if (selectedTemplate === "custom") {
        setCurrentStep("template");
      } else {
        setCurrentStep("purpose");
      }
    } else if (currentStep === "purpose") {
      setCurrentStep("template");
    }
  };

  const handleCreateServer = async (name: string, avatarUrl?: string) => {
    if (!name.trim()) {
      alert("Vui lòng nhập tên máy chủ");
      return;
    }

    setIsCreating(true);
    try {
      const server = await createServer(
        name,
        undefined,
        avatarUrl,
        selectedTemplate || "custom",
        selectedPurpose || "me-and-friends"
      );
      
      if (onServerCreated) {
        onServerCreated(server._id);
      }
      
      handleClose();
    } catch (error) {
      console.error("Failed to create server:", error);
      alert("Không thể tạo máy chủ. Vui lòng thử lại.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setCurrentStep("template");
    setSelectedTemplate(null);
    setSelectedPurpose(null);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={handleClose}>
          ×
        </button>

        {currentStep === "template" && (
          <ServerTemplateSelector onSelectTemplate={handleTemplateSelect} />
        )}

        {currentStep === "purpose" && (
          <ServerPurposeSelector
            onSelectPurpose={handlePurposeSelect}
            onBack={handleBack}
          />
        )}

        {currentStep === "customize" && (
          <ServerCustomization
            onCreateServer={handleCreateServer}
            onBack={handleBack}
            isCreating={isCreating}
          />
        )}
      </div>
    </div>
  );
}
