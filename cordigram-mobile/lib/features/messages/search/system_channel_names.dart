import 'system_channel_map.generated.dart';

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
