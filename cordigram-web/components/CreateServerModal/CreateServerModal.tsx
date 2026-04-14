"use client";

import React, { useState } from "react";
import styles from "./CreateServerModal.module.css";
import ServerTemplateSelector from "./ServerTemplateSelector";
import ServerPurposeSelector from "./ServerPurposeSelector";
import ServerCustomization from "./ServerCustomization";
import { createServer, type ServerTemplate, type ServerPurpose } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

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
  const { t, language } = useLanguage();
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
      alert(t("chat.createServer.errors.nameRequired"));
      return;
    }

    setIsCreating(true);
    try {
      const server = await createServer(
        name,
        undefined,
        avatarUrl,
        selectedTemplate || "custom",
        selectedPurpose || "me-and-friends",
        language as "vi" | "en" | "ja" | "zh"
      );
      
      if (onServerCreated) {
        onServerCreated(server._id);
      }
      
      handleClose();
    } catch (error) {
      console.error("Failed to create server:", error);
      alert(t("chat.createServer.errors.createFailed"));
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
