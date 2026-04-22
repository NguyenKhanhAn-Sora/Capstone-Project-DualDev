import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

/// Mirrors web `createPoll` — `POST /polls`.
class PollsApiService {
  PollsApiService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<String> createPoll({
    required String question,
    required List<String> options,
    int durationHours = 24,
    bool allowMultipleAnswers = false,
  }) async {
    final res = await ApiService.post(
      '/polls',
      extraHeaders: _authHeaders,
      body: {
        'question': question,
        'options': options,
        'durationHours': durationHours,
        'allowMultipleAnswers': allowMultipleAnswers,
      },
    );
    final id = (res['_id'] ?? res['id'] ?? '').toString();
    if (id.isEmpty) {
      throw Exception('Không tạo được khảo sát');
    }
    return id;
  }

  static Future<Map<String, dynamic>> getPollResults(String pollId) async {
    return ApiService.get(
      '/polls/$pollId/results',
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<int>> getMyVote(String pollId) async {
    try {
      final list = await ApiService.getList(
        '/polls/$pollId/my-vote',
        extraHeaders: _authHeaders,
      );
      return list
          .map((e) => e is num ? e.toInt() : int.tryParse(e.toString()))
          .whereType<int>()
          .toList();
    } catch (_) {}

    final res = await ApiService.get(
      '/polls/$pollId/my-vote',
      extraHeaders: _authHeaders,
    );
    final raw = res['selectedOptions'] ?? res['optionIndexes'] ?? res['votes'];
    if (raw is! List) return const <int>[];
    return raw
        .map((e) => e is num ? e.toInt() : int.tryParse(e.toString()))
        .whereType<int>()
        .toList();
  }

  static Future<void> votePoll({
    required String pollId,
    required List<int> optionIndexes,
  }) async {
    await ApiService.post(
      '/polls/$pollId/vote',
      extraHeaders: _authHeaders,
      body: {'optionIndexes': optionIndexes},
    );
  }
}
