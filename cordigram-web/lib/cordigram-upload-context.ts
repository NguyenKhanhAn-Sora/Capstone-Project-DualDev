/** Đồng bộ với `cordigram-backend/src/common/cordigram-upload-context.ts` */
export const CORDIGRAM_UPLOAD_CONTEXT_HEADER = "x-cordigram-upload-context";
export const CORDIGRAM_MESSAGES_UPLOAD_CONTEXT = "messages";

export type CordigramUploadContext = "messages";

export function withCordigramUploadContext(
  headers: Record<string, string>,
  context?: CordigramUploadContext,
): Record<string, string> {
  if (context === "messages") {
    return {
      ...headers,
      [CORDIGRAM_UPLOAD_CONTEXT_HEADER]: CORDIGRAM_MESSAGES_UPLOAD_CONTEXT,
    };
  }
  return headers;
}
