import { useCallback, useState } from "react";
import type { ModeratorMemberDetail } from "@/lib/mod-view-api";
import * as modViewApi from "@/lib/mod-view-api";

export interface UseModeratorViewOptions {
  serverId: string;
  canEnable: boolean;
}

/** Chỉ tải chi tiết thành viên (panel Mod); danh sách lấy từ getServerMembersWithRoles đã enrich. */
export function useModeratorView({ serverId, canEnable }: UseModeratorViewOptions) {
  const [enabled, setEnabledState] = useState(false);

  const [detail, setDetail] = useState<ModeratorMemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!canEnable) return;
      setEnabledState(next);
      if (!next) {
        setDetail(null);
        setDetailError(null);
      }
    },
    [canEnable],
  );

  const loadDetail = useCallback(
    async (memberId: string) => {
      if (!canEnable) return;
      if (!memberId.trim()) {
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await modViewApi.getModeratorMemberDetail(serverId, memberId);
        setDetail(data);
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : "Không tải được chi tiết thành viên");
      } finally {
        setDetailLoading(false);
      }
    },
    [canEnable, serverId],
  );

  return {
    enabled,
    canEnable,
    detail,
    detailLoading,
    detailError,
    setEnabled,
    loadDetail,
  };
}
