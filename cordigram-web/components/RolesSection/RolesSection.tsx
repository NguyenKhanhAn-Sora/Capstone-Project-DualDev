"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./RolesSection.module.css";
import * as serversApi from "@/lib/servers-api";
import type { Role } from "@/lib/servers-api";
import RoleEditModal from "@/components/RoleEditModal/RoleEditModal";

interface RolesSectionProps {
  serverId: string;
  isOwner: boolean;
}

export default function RolesSection({ serverId, isOwner }: RolesSectionProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await serversApi.getRoles(serverId);
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách vai trò");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleCreateRole = async () => {
    if (!isOwner) return;
    try {
      const newRole = await serversApi.createRole(serverId, {
        name: "vai trò mới",
        color: "#99AAB5",
      });
      setRoles((prev) => [newRole, ...prev]);
      setSelectedRole(newRole);
      setIsEditModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không tạo được vai trò");
    }
  };

  const handleRoleClick = (role: Role) => {
    setSelectedRole(role);
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setSelectedRole(null);
  };

  const handleRoleUpdate = (updatedRole: Role) => {
    setRoles((prev) =>
      prev.map((r) => (r._id === updatedRole._id ? updatedRole : r))
    );
    setSelectedRole(updatedRole);
  };

  const handleRoleDelete = (roleId: string) => {
    setRoles((prev) => prev.filter((r) => r._id !== roleId));
    setIsEditModalOpen(false);
    setSelectedRole(null);
  };

  const handleRoleCreate = (newRole: Role) => {
    setRoles((prev) => [newRole, ...prev.filter((r) => r._id !== newRole._id)]);
    setSelectedRole(newRole);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Đang tải...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <button className={styles.retryBtn} onClick={fetchRoles}>
          Thử lại
        </button>
      </div>
    );
  }

  const defaultRole = roles.find((r) => r.isDefault);
  const customRoles = roles.filter((r) => !r.isDefault);

  return (
    <div className={styles.container}>
      {/* Banner */}
      <div className={styles.banner}>
        <div className={styles.bannerContent}>
          <div className={styles.bannerIllustration}>
            <div className={styles.illustrationPlaceholder}>
              <svg width="200" height="120" viewBox="0 0 200 120" fill="none">
                <rect x="20" y="30" width="60" height="60" rx="8" fill="#5865F2" opacity="0.3" />
                <rect x="50" y="20" width="60" height="70" rx="8" fill="#5865F2" opacity="0.5" />
                <rect x="80" y="25" width="60" height="65" rx="8" fill="#5865F2" opacity="0.7" />
                <circle cx="80" cy="50" r="20" fill="#5865F2" />
                <text x="80" y="55" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">W</text>
                <text x="80" y="82" textAnchor="middle" fill="white" fontSize="10">Wumpus#0000</text>
                <circle cx="35" cy="95" r="6" fill="#57F287" />
                <text x="50" y="98" fill="#57F287" fontSize="8">chủ tịch</text>
                <circle cx="85" cy="95" r="6" fill="#5865F2" />
                <text x="100" y="98" fill="#5865F2" fontSize="8">lãnh đạo</text>
                <circle cx="135" cy="95" r="6" fill="#EB459E" />
                <text x="155" y="98" fill="#EB459E" fontSize="8">huấn luyện viên</text>
              </svg>
            </div>
          </div>
          <div className={styles.bannerText}>
            <h2 className={styles.bannerTitle}>Quản lý thành viên</h2>
            <p className={styles.bannerDesc}>
              Sử dụng vai trò để phân nhóm các thành viên máy chủ và chỉ định quyền của họ.
            </p>
            {isOwner && (
              <button className={styles.createBtn} onClick={handleCreateRole}>
                Tạo Vai Trò
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Roles List */}
      <div className={styles.rolesList}>
        {/* Custom Roles */}
        {customRoles.map((role) => (
          <div
            key={role._id}
            className={styles.roleItem}
            onClick={() => handleRoleClick(role)}
          >
            <div className={styles.roleInfo}>
              <span
                className={styles.roleColorDot}
                style={{ backgroundColor: role.color }}
              />
              <span className={styles.roleName}>{role.name}</span>
            </div>
            <span className={styles.roleArrow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </div>
        ))}

        {/* Default @everyone Role - hiển thị giống như các vai trò khác */}
        {defaultRole && (
          <div
            className={styles.roleItem}
            onClick={() => handleRoleClick(defaultRole)}
          >
            <div className={styles.roleInfo}>
              <span
                className={styles.roleColorDot}
                style={{ backgroundColor: defaultRole.color || "#99AAB5" }}
              />
              <span className={styles.roleName}>@everyone</span>
            </div>
            <span className={styles.roleArrow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && selectedRole && (
        <RoleEditModal
          serverId={serverId}
          role={selectedRole}
          roles={roles}
          isOwner={isOwner}
          onClose={handleCloseModal}
          onUpdate={handleRoleUpdate}
          onDelete={handleRoleDelete}
          onCreate={handleRoleCreate}
        />
      )}
    </div>
  );
}
