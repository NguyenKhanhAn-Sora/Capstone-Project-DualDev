import 'package:http/http.dart' as http;

class VttCue {
  const VttCue({required this.start, required this.end, required this.text});
  final Duration start;
  final Duration end;
  final String text;
}

Duration _parseVttTime(String raw) {
  final t = raw.trim().split(' ').first; // drop positioning hints
  final parts = t.split(':');
  try {
    if (parts.length == 3) {
      final h = int.parse(parts[0]);
      final m = int.parse(parts[1]);
      final s = double.parse(parts[2]);
      return Duration(milliseconds: (h * 3600000 + m * 60000 + s * 1000).round());
    } else if (parts.length == 2) {
      final m = int.parse(parts[0]);
      final s = double.parse(parts[1]);
      return Duration(milliseconds: (m * 60000 + s * 1000).round());
    }
  } catch (_) {}
  return Duration.zero;
}

List<VttCue> parseVtt(String content) {
  final cues = <VttCue>[];
  // Normalise line endings and split on blank lines
  final blocks = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n\n');
  for (final block in blocks) {
    final lines = block.trim().split('\n');
    // Find the line containing '-->'
    int arrowIdx = -1;
    for (int i = 0; i < lines.length; i++) {
      if (lines[i].contains('-->')) {
        arrowIdx = i;
        break;
      }
    }
    if (arrowIdx < 0) continue;

    final timeParts = lines[arrowIdx].split('-->');
    if (timeParts.length < 2) continue;

    final start = _parseVttTime(timeParts[0]);
    final end = _parseVttTime(timeParts[1]);

    // Everything after the timestamp line is the cue text
    final text = lines.sublist(arrowIdx + 1).join('\n').trim();
    if (text.isNotEmpty) {
      cues.add(VttCue(start: start, end: end, text: text));
    }
  }
  return cues;
}

Future<List<VttCue>> fetchAndParseVtt(String url) async {
  try {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode == 200) return parseVtt(response.body);
  } catch (_) {}
  return [];
}

/// Returns the cue active at [position], or null if none.
VttCue? activeCue(List<VttCue> cues, Duration position) {
  for (final cue in cues) {
    if (position >= cue.start && position < cue.end) return cue;
  }
  return null;
}
