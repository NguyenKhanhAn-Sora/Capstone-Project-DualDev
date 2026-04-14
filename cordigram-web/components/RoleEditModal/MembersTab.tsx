"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./MembersTab.module.css";
import type { Role, ServerMemberRow } from "@/lib/servers-api";
import * as serversApi from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface MembersTabProps {
  serverId: string;
  role: Role;
  isOwner: boolean;
  onUpdate: (role: Role) => void;
}

export default function MembersTab({
  serverId,
  role,
  isOwner,
  onUpdate,
}: MembersTabProps) {
  const { t } = useLanguage();
  const [allMembers, setAllMembers] = useState<ServerMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setPermissionDenied(false);
      const members = await serversApi.getServerMembers(serverId);
      setAllMembers(members);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("quyền") || msg.includes("403") || msg.includes("Forbidden")) {
        setPermissionDenied(true);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const roleMembers = allMembers.filter((m) =>
    role.memberIds.includes(m.userId)
  );

  const availableMembers = allMembers.filter(
    (m) => !role.memberIds.includes(m.userId) && !role.isDefault
  );

  const filteredRoleMembers = roleMembers.filter(
    (m) =>
      m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAvailableMembers = availableMembers.filter(
    (m) =>
      m.displayName.toLowerCase().includes(addSearchQuery.toLowerCase()) ||
      m.username.toLowerCase().includes(addSearchQuery.toLowerCase())
  );

  const handleAddMember = async (memberId: string) => {
    if (!isOwner || role.isDefault) return;
    setSaving(true);
    try {
      const updated = await serversApi.addMemberToRole(serverId, role._id, memberId);
      onUpdate(updated);
      setShowAddModal(false);
      setAddSearchQuery("");
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleMembers.errorAdd"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!isOwner || role.isDefault) return;
    if (!window.confirm(t("chat.roleMembers.confirmRemove"))) {
      return;
    }
    setSaving(true);
    try {
      const updated = await serversApi.removeMemberFromRole(serverId, role._id, memberId);
      onUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleMembers.errorRemove"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t("chat.roleMembers.loading")}</div>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className={styles.container}>
        <div className={styles.defaultRoleMessage}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <h3>{t("chat.roleMembers.noAccessTitle")}</h3>
          <p>{t("chat.roleMembers.noAccessDesc")}</p>
        </div>
      </div>
    );
  }

  if (role.isDefault) {
    return (
      <div className={styles.container}>
        <div className={styles.defaultRoleMessage}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <h3>{t("chat.roleMembers.everyoneTitle")}</h3>
          <p>{t("chat.roleMembers.everyoneDesc")}</p>
          <div className={styles.memberCount}>
            {t("chat.roleMembers.memberCount", { count: allMembers.length })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t("chat.roleMembers.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {isOwner && (
          <button
            className={styles.addBtn}
            onClick={() => setShowAddModal(true)}
            disabled={saving}
          >
            {t("chat.roleMembers.addMember")}
          </button>
        )}
      </div>

      {/* Members List */}
      <div className={styles.membersList}>
        {filteredRoleMembers.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? (
              <>{t("chat.roleMembers.emptySearch", { query: searchQuery })}</>
            ) : (
              <>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <p>{t("chat.roleMembers.emptyRole")}</p>
                {isOwner && (
                  <button
                    className={styles.addBtnSecondary}
                    onClick={() => setShowAddModal(true)}
                  >
                    {t("chat.roleMembers.addMember")}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          filteredRoleMembers.map((member) => (
            <div key={member.userId} className={styles.memberItem}>
              <div className={styles.memberInfo}>
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.nickname?.trim() ? member.nickname.trim() : member.displayName}
                    className={styles.memberAvatar}
                  />
                ) : (
                  <div className={styles.memberAvatarPlaceholder}>
                    {(member.nickname?.trim() ? member.nickname.trim() : member.displayName).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.memberText}>
                  <span className={styles.memberName}>
                    {member.nickname?.trim() ? member.nickname.trim() : member.displayName}
                  </span>
                  <span className={styles.memberUsername}>@{member.username}</span>
                </div>
              </div>
              {isOwner && (
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveMember(member.userId)}
                  disabled={saving}
                  title={t("chat.roleMembers.removeFromRoleTitle")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{t("chat.roleMembers.addMember")}</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowAddModal(false)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.searchWrapper}>
                <svg
                  className={styles.searchIcon}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder={t("chat.roleMembers.searchPlaceholder")}
                  value={addSearchQuery}
                  onChange={(e) => setAddSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.availableMembersList}>
                {filteredAvailableMembers.length === 0 ? (
                  <div className={styles.noMembers}>
                    {addSearchQuery
                      ? t("chat.roleMembers.emptySearch", { query: addSearchQuery })
                      : t("chat.roleMembers.allHaveRole")}
                  </div>
                ) : (
                  filteredAvailableMembers.map((member) => (
                    <div
                      key={member.userId}
                      className={styles.availableMemberItem}
                      onClick={() => handleAddMember(member.userId)}
                    >
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName}
                          className={styles.memberAvatar}
                        />
                      ) : (
                        <div className={styles.memberAvatarPlaceholder}>
                          {member.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={styles.memberText}>
                        <span className={styles.memberName}>{member.displayName}</span>
                        <span className={styles.memberUsername}>@{member.username}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
