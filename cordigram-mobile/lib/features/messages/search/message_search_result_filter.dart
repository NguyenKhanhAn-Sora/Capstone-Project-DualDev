/// Hides search hits the viewer can no longer open (deleted / xóa phía tôi).
/// Mirrors server-side intent (`isDeleted`, `deletedFor` on DM + channel messages).
bool messageSearchResultIsVisibleForViewer(
  Map<String, dynamic> m,
  String? viewerUserId,
) {
  final iso = m['isDeleted'];
  if (iso == true ||
      iso == 1 ||
      iso == '1' ||
      (iso is String && iso.toLowerCase() == 'true')) {
    return false;
  }

  final vid = (viewerUserId ?? '').trim();
  if (vid.isEmpty) return true;

  final df = m['deletedFor'];
  if (df is! List || df.isEmpty) return true;

  final vLower = vid.toLowerCase();
  for (final x in df) {
    String? id;
    if (x is Map) {
      id = (x['_id'] ?? x['id'])?.toString();
    } else {
      id = x?.toString();
    }
    if (id != null && id.trim().toLowerCase() == vLower) {
      return false;
    }
  }
  return true;
}
