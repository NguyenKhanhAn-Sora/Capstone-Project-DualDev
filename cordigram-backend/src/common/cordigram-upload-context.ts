import type { Request } from 'express';

/** Client gửi header này khi upload từ Messages (DM/server) để áp giới hạn theo gói Boost. */
export const CORDIGRAM_UPLOAD_CONTEXT_HEADER = 'x-cordigram-upload-context';

export function isCordigramMessagesUpload(
  req: Pick<Request, 'headers'>,
): boolean {
  const raw = req.headers[CORDIGRAM_UPLOAD_CONTEXT_HEADER];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (
    String(v || '')
      .trim()
      .toLowerCase() === 'messages'
  );
}
