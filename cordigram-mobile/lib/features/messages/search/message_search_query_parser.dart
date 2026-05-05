import 'package:diacritic/diacritic.dart';

/// Client-side mirror of
/// `cordigram-web/lib/message-search-query.ts` /
/// `cordigram-backend/src/messages/message-search-query.parser.ts`.

enum MessageSearchHasType { image, file }

class ParsedMessageSearchFilters {
  const ParsedMessageSearchFilters({
    this.from,
    this.inChannel,
    this.has,
  });

  final String? from;
  final String? inChannel;
  final MessageSearchHasType? has;

  ParsedMessageSearchFilters copyWithoutIn() =>
      ParsedMessageSearchFilters(from: from, has: has);
}

class ParsedMessageSearch {
  const ParsedMessageSearch({
    required this.text,
    required this.filters,
  });

  final String text;
  final ParsedMessageSearchFilters filters;
}

({String value, int end}) _readFilterValue(String s, int start) {
  var i = start;
  if (i < s.length && s[i] == '"') {
    final endQuote = s.indexOf('"', i + 1);
    if (endQuote == -1) {
      return (value: s.substring(i + 1), end: s.length);
    }
    return (value: s.substring(i + 1, endQuote), end: endQuote + 1);
  }
  var end = i;
  while (end < s.length) {
    if (RegExp(r'\s').hasMatch(s[end])) break;
    final tail = s.substring(end);
    if (RegExp(r'^(from|in|has):', caseSensitive: false).hasMatch(tail)) {
      break;
    }
    end++;
  }
  return (value: s.substring(i, end).trim(), end: end);
}

int _skipSpaces(String s, int i) {
  var j = i;
  while (j < s.length && RegExp(r'\s').hasMatch(s[j])) {
    j++;
  }
  return j;
}

MessageSearchHasType _mapHasValue(String raw) {
  final v = raw.trim().toLowerCase();
  if (['file', 'files', 'attachment', 'attachments'].contains(v)) {
    return MessageSearchHasType.file;
  }
  return MessageSearchHasType.image;
}

ParsedMessageSearch parseMessageSearchQuery(String input) {
  String? from;
  String? inChannel;
  MessageSearchHasType? has;
  final textParts = <String>[];
  final s = input.trim();
  var i = 0;

  while (i < s.length) {
    i = _skipSpaces(s, i);
    if (i >= s.length) break;
    final rest = s.substring(i);
    final fm = RegExp(r'^(from|in|has):', caseSensitive: false).firstMatch(rest);
    if (fm != null) {
      i += fm.group(0)!.length;
      final read = _readFilterValue(s, i);
      i = _skipSpaces(s, read.end);
      final key = fm.group(1)!.toLowerCase();
      if (key == 'from') {
        from = read.value;
      } else if (key == 'in') {
        inChannel = read.value;
      } else if (key == 'has') {
        has = _mapHasValue(read.value);
      }
    } else {
      var end = i;
      while (end < s.length) {
        if (RegExp(r'\s').hasMatch(s[end])) break;
        final tail = s.substring(end);
        if (RegExp(r'^(from|in|has):', caseSensitive: false).hasMatch(tail)) {
          break;
        }
        end++;
      }
      textParts.add(s.substring(i, end));
      i = end;
    }
  }

  final joined = textParts.join(' ').replaceAll(RegExp(r'\s+'), ' ').trim();
  return ParsedMessageSearch(
    text: joined,
    filters: ParsedMessageSearchFilters(from: from, inChannel: inChannel, has: has),
  );
}

ParsedMessageSearch parseMessageSearchQueryForDm(String input) {
  final base = parseMessageSearchQuery(input);
  return ParsedMessageSearch(
    text: base.text,
    filters: base.filters.copyWithoutIn(),
  );
}

({String kind, String needle}) parseQuickSwitchPrefix(
  String raw, {
  bool enableQuickSwitch = true,
  bool includeStarQuickSwitch = true,
}) {
  if (!enableQuickSwitch) {
    return (kind: '', needle: '');
  }
  final t = raw.trimLeft();
  if (t.isEmpty) return (kind: '', needle: '');
  final c = t[0];
  if (c == '@') return (kind: '@', needle: t.substring(1).trimLeft());
  if (c == '#') return (kind: '#', needle: t.substring(1).trimLeft());
  if (c == '!') return (kind: '!', needle: t.substring(1).trimLeft());
  if (c == '*' && includeStarQuickSwitch) {
    return (kind: '*', needle: t.substring(1).trimLeft());
  }
  return (kind: '', needle: '');
}

bool matchesNeedle(String needle, List<String?> fields) {
  /// Aligns with web `MessageSearchPanel` (`normalize` + đ folding).
  String normalizeSearchText(String v) {
    final folded = removeDiacritics(v)
        .toLowerCase()
        .replaceAll('đ', 'd')
        .replaceAll('Đ', 'd');
    return folded;
  }

  final n = normalizeSearchText(needle.trim());
  if (n.isEmpty) return true;
  for (final f in fields) {
    if (normalizeSearchText(f ?? '').contains(n)) return true;
  }
  return false;
}
