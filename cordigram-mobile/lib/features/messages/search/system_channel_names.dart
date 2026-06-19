import 'system_channel_map.generated.dart';

const _categoryNameRows = <String, Map<String, String>>{
  'Thông Tin': {'vi': 'Thông Tin', 'en': 'Information', 'ja': '情報', 'zh': '信息'},
  'Information': {'vi': 'Thông Tin', 'en': 'Information', 'ja': '情報', 'zh': '信息'},
  'Kênh Chat': {'vi': 'Kênh Chat', 'en': 'Text Channels', 'ja': 'テキストチャンネル', 'zh': '文字频道'},
  'Text Channels': {'vi': 'Kênh Chat', 'en': 'Text Channels', 'ja': 'テキストチャンネル', 'zh': '文字频道'},
  'Kênh Thoại': {'vi': 'Kênh Thoại', 'en': 'Voice Channels', 'ja': 'ボイスチャンネル', 'zh': '语音频道'},
  'Voice Channels': {'vi': 'Kênh Thoại', 'en': 'Voice Channels', 'ja': 'ボイスチャンネル', 'zh': '语音频道'},
};

/// Same contract as cordigram-web `translateChannelName` (`system-names.ts`).
String translateChannelName(String name, String languageCode) {
  final row = systemChannelNameRows[name];
  if (row == null) return name;
  final lc = languageCode.toLowerCase();
  if (lc.startsWith('vi')) return row['vi'] ?? name;
  if (lc.startsWith('en')) return row['en'] ?? name;
  if (lc.startsWith('ja')) return row['ja'] ?? name;
  if (lc.startsWith('zh')) return row['zh'] ?? name;
  return row['en'] ?? row['vi'] ?? name;
}

String translateCategoryName(String name, String languageCode) {
  final row = _categoryNameRows[name];
  if (row == null) return name;
  final lc = languageCode.toLowerCase();
  if (lc.startsWith('vi')) return row['vi'] ?? name;
  if (lc.startsWith('en')) return row['en'] ?? name;
  if (lc.startsWith('ja')) return row['ja'] ?? name;
  if (lc.startsWith('zh')) return row['zh'] ?? name;
  return row['en'] ?? row['vi'] ?? name;
}

String resolveServerDisplayLanguage({
  required bool primaryLanguageConfigured,
  required String primaryLanguage,
  required String userLanguage,
}) {
  if (!primaryLanguageConfigured) return userLanguage;
  if (const {'vi', 'en', 'ja', 'zh'}.contains(primaryLanguage)) {
    return primaryLanguage;
  }
  return userLanguage;
}

/// Fields to match against quick-switch needle (web: `ch.name` + translated).
List<String> channelQuickSwitchMatchFields(
  String channelName,
  String languageCode,
) {
  final translated = translateChannelName(channelName, languageCode);
  final row = systemChannelNameRows[channelName];
  if (row == null) {
    return channelName == translated
        ? [channelName]
        : [channelName, translated];
  }
  return {
    channelName,
    translated,
    ...row.values,
  }.toList();
}
