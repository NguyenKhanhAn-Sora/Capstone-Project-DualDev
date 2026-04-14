/**
 * Translates system-generated channel/category names at render time.
 *
 * When a server was created with Vietnamese as the UI language (or before i18n
 * was added), default names are stored in Vietnamese. This utility maps those
 * canonical Vietnamese names to the current-language equivalents, so the
 * sidebar always reflects the user's chosen language.
 *
 * Names that were manually renamed by the server owner are NOT affected because
 * they won't appear in this map.
 */

/** All known system category names keyed by canonical (Vietnamese) value. */
const CATEGORY_MAP: Record<string, Record<string, string>> = {
  "Thông Tin":  { vi: "Thông Tin",  en: "Information",    ja: "情報",              zh: "信息"     },
  "Kênh Chat":  { vi: "Kênh Chat",  en: "Text Channels",  ja: "テキストチャンネル", zh: "文字频道" },
  "Kênh Thoại": { vi: "Kênh Thoại", en: "Voice Channels", ja: "ボイスチャンネル",  zh: "语音频道" },
  // Also cover names that were created in English/Japanese/Chinese
  "Information":    { vi: "Thông Tin",  en: "Information",    ja: "情報",              zh: "信息"     },
  "情報":           { vi: "Thông Tin",  en: "Information",    ja: "情報",              zh: "信息"     },
  "信息":           { vi: "Thông Tin",  en: "Information",    ja: "情報",              zh: "信息"     },
  "Text Channels":  { vi: "Kênh Chat",  en: "Text Channels",  ja: "テキストチャンネル", zh: "文字频道" },
  "テキストチャンネル": { vi: "Kênh Chat", en: "Text Channels", ja: "テキストチャンネル", zh: "文字频道" },
  "文字频道":       { vi: "Kênh Chat",  en: "Text Channels",  ja: "テキストチャンネル", zh: "文字频道" },
  "Voice Channels": { vi: "Kênh Thoại", en: "Voice Channels", ja: "ボイスチャンネル",  zh: "语音频道" },
  "ボイスチャンネル":{ vi: "Kênh Thoại", en: "Voice Channels", ja: "ボイスチャンネル",  zh: "语音频道" },
  "语音频道":       { vi: "Kênh Thoại", en: "Voice Channels", ja: "ボイスチャンネル",  zh: "语音频道" },
};

/** All known system channel names keyed by canonical (Vietnamese) value. */
const CHANNEL_MAP: Record<string, Record<string, string>> = {
  "chung":                        { vi: "chung",                        en: "general",           ja: "一般",             zh: "综合"     },
  "general":                      { vi: "chung",                        en: "general",           ja: "一般",             zh: "综合"     },
  "一般":                          { vi: "chung",                        en: "general",           ja: "一般",             zh: "综合"     },
  "综合":                          { vi: "chung",                        en: "general",           ja: "一般",             zh: "综合"     },
  "khoảnh-khắc-đỉnh-cao":        { vi: "khoảnh-khắc-đỉnh-cao",        en: "highlights",        ja: "ハイライト",       zh: "精彩时刻" },
  "highlights":                   { vi: "khoảnh-khắc-đỉnh-cao",        en: "highlights",        ja: "ハイライト",       zh: "精彩时刻" },
  "ハイライト":                    { vi: "khoảnh-khắc-đỉnh-cao",        en: "highlights",        ja: "ハイライト",       zh: "精彩时刻" },
  "精彩时刻":                      { vi: "khoảnh-khắc-đỉnh-cao",        en: "highlights",        ja: "ハイライト",       zh: "精彩时刻" },
  "Sảnh":                         { vi: "Sảnh",                         en: "Lobby",             ja: "ロビー",           zh: "大厅"     },
  "Lobby":                        { vi: "Sảnh",                         en: "Lobby",             ja: "ロビー",           zh: "大厅"     },
  "ロビー":                        { vi: "Sảnh",                         en: "Lobby",             ja: "ロビー",           zh: "大厅"     },
  "大厅":                          { vi: "Sảnh",                         en: "Lobby",             ja: "ロビー",           zh: "大厅"     },
  "trò-chơi":                     { vi: "trò-chơi",                     en: "gaming",            ja: "ゲーム",           zh: "游戏"     },
  "ゲーム":                        { vi: "trò-chơi",                     en: "gaming",            ja: "ゲーム",           zh: "游戏"     },
  "游戏":                          { vi: "trò-chơi",                     en: "gaming",            ja: "ゲーム",           zh: "游戏"     },
  "âm-nhạc":                      { vi: "âm-nhạc",                      en: "music",             ja: "音楽",             zh: "音乐"     },
  "music":                        { vi: "âm-nhạc",                      en: "music",             ja: "音楽",             zh: "音乐"     },
  "音楽":                          { vi: "âm-nhạc",                      en: "music",             ja: "音楽",             zh: "音乐"     },
  "音乐":                          { vi: "âm-nhạc",                      en: "music",             ja: "音楽",             zh: "音乐"     },
  "Phòng Chờ":                    { vi: "Phòng Chờ",                    en: "Waiting Room",      ja: "待機室",           zh: "等待室"   },
  "Waiting Room":                 { vi: "Phòng Chờ",                    en: "Waiting Room",      ja: "待機室",           zh: "等待室"   },
  "待機室":                        { vi: "Phòng Chờ",                    en: "Waiting Room",      ja: "待機室",           zh: "等待室"   },
  "等待室":                        { vi: "Phòng Chờ",                    en: "Waiting Room",      ja: "待機室",           zh: "等待室"   },
  "Phòng Stream":                 { vi: "Phòng Stream",                 en: "Streaming",         ja: "配信",             zh: "直播"     },
  "Streaming":                    { vi: "Phòng Stream",                 en: "Streaming",         ja: "配信",             zh: "直播"     },
  "配信":                          { vi: "Phòng Stream",                 en: "Streaming",         ja: "配信",             zh: "直播"     },
  "直播":                          { vi: "Phòng Stream",                 en: "Streaming",         ja: "配信",             zh: "直播"     },
  "chào-mừng-và-nội-quy":        { vi: "chào-mừng-và-nội-quy",        en: "welcome-and-rules", ja: "ようこそ-ルール",   zh: "欢迎-规则"},
  "welcome-and-rules":            { vi: "chào-mừng-và-nội-quy",        en: "welcome-and-rules", ja: "ようこそ-ルール",   zh: "欢迎-规则"},
  "ようこそ-ルール":               { vi: "chào-mừng-và-nội-quy",        en: "welcome-and-rules", ja: "ようこそ-ルール",   zh: "欢迎-规则"},
  "欢迎-规则":                     { vi: "chào-mừng-và-nội-quy",        en: "welcome-and-rules", ja: "ようこそ-ルール",   zh: "欢迎-规则"},
  "ghi-chú-tài-nguyên":          { vi: "ghi-chú-tài-nguyên",          en: "notes-resources",   ja: "ノート-リソース",   zh: "笔记-资源"},
  "notes-resources":              { vi: "ghi-chú-tài-nguyên",          en: "notes-resources",   ja: "ノート-リソース",   zh: "笔记-资源"},
  "ノート-リソース":               { vi: "ghi-chú-tài-nguyên",          en: "notes-resources",   ja: "ノート-リソース",   zh: "笔记-资源"},
  "笔记-资源":                     { vi: "ghi-chú-tài-nguyên",          en: "notes-resources",   ja: "ノート-リソース",   zh: "笔记-资源"},
  "trợ-giúp-làm-bài-tập-về-nhà":{ vi: "trợ-giúp-làm-bài-tập-về-nhà",en: "homework-help",     ja: "宿題サポート",     zh: "作业帮助" },
  "homework-help":                { vi: "trợ-giúp-làm-bài-tập-về-nhà",en: "homework-help",     ja: "宿題サポート",     zh: "作业帮助" },
  "宿題サポート":                  { vi: "trợ-giúp-làm-bài-tập-về-nhà",en: "homework-help",     ja: "宿題サポート",     zh: "作业帮助" },
  "作业帮助":                      { vi: "trợ-giúp-làm-bài-tập-về-nhà",en: "homework-help",     ja: "宿題サポート",     zh: "作业帮助" },
  "lên-kế-hoạch-phiên":          { vi: "lên-kế-hoạch-phiên",          en: "session-planning",  ja: "セッション計画",   zh: "学习计划" },
  "session-planning":             { vi: "lên-kế-hoạch-phiên",          en: "session-planning",  ja: "セッション計画",   zh: "学习计划" },
  "セッション計画":                { vi: "lên-kế-hoạch-phiên",          en: "session-planning",  ja: "セッション計画",   zh: "学习计划" },
  "学习计划":                      { vi: "lên-kế-hoạch-phiên",          en: "session-planning",  ja: "セッション計画",   zh: "学习计划" },
  "lạc-đề":                       { vi: "lạc-đề",                       en: "off-topic",         ja: "雑談",             zh: "闲聊"     },
  "off-topic":                    { vi: "lạc-đề",                       en: "off-topic",         ja: "雑談",             zh: "闲聊"     },
  "雑談":                          { vi: "lạc-đề",                       en: "off-topic",         ja: "雑談",             zh: "闲聊"     },
  "闲聊":                          { vi: "lạc-đề",                       en: "off-topic",         ja: "雑談",             zh: "闲聊"     },
  "Phòng Học 1":                  { vi: "Phòng Học 1",                  en: "Study Room 1",      ja: "学習室-1",         zh: "学习室-1" },
  "Study Room 1":                 { vi: "Phòng Học 1",                  en: "Study Room 1",      ja: "学習室-1",         zh: "学习室-1" },
  "学習室-1":                      { vi: "Phòng Học 1",                  en: "Study Room 1",      ja: "学習室-1",         zh: "学习室-1" },
  "学习室-1":                      { vi: "Phòng Học 1",                  en: "Study Room 1",      ja: "学習室-1",         zh: "学习室-1" },
  "Phòng Học 2":                  { vi: "Phòng Học 2",                  en: "Study Room 2",      ja: "学習室-2",         zh: "学习室-2" },
  "Study Room 2":                 { vi: "Phòng Học 2",                  en: "Study Room 2",      ja: "学習室-2",         zh: "学习室-2" },
  "学習室-2":                      { vi: "Phòng Học 2",                  en: "Study Room 2",      ja: "学習室-2",         zh: "学习室-2" },
  "学习室-2":                      { vi: "Phòng Học 2",                  en: "Study Room 2",      ja: "学習室-2",         zh: "学习室-2" },
  "thông-báo":                    { vi: "thông-báo",                    en: "announcements",     ja: "お知らせ",         zh: "公告"     },
  "announcements":                { vi: "thông-báo",                    en: "announcements",     ja: "お知らせ",         zh: "公告"     },
  "お知らせ":                      { vi: "thông-báo",                    en: "announcements",     ja: "お知らせ",         zh: "公告"     },
  "公告":                          { vi: "thông-báo",                    en: "announcements",     ja: "お知らせ",         zh: "公告"     },
  "tài-nguyên":                   { vi: "tài-nguyên",                   en: "resources",         ja: "リソース",         zh: "资源"     },
  "resources":                    { vi: "tài-nguyên",                   en: "resources",         ja: "リソース",         zh: "资源"     },
  "リソース":                      { vi: "tài-nguyên",                   en: "resources",         ja: "リソース",         zh: "资源"     },
  "资源":                          { vi: "tài-nguyên",                   en: "resources",         ja: "リソース",         zh: "资源"     },
  "kế-hoạch-buổi-họp":           { vi: "kế-hoạch-buổi-họp",           en: "meeting-plan",      ja: "会議計画",         zh: "会议计划" },
  "meeting-plan":                 { vi: "kế-hoạch-buổi-họp",           en: "meeting-plan",      ja: "会議計画",         zh: "会议计划" },
  "会議計画":                      { vi: "kế-hoạch-buổi-họp",           en: "meeting-plan",      ja: "会議計画",         zh: "会议计划" },
  "会议计划":                      { vi: "kế-hoạch-buổi-họp",           en: "meeting-plan",      ja: "会議計画",         zh: "会议计划" },
  "Phòng Họp 1":                  { vi: "Phòng Họp 1",                  en: "Meeting Room 1",    ja: "会議室-1",         zh: "会议室-1" },
  "Meeting Room 1":               { vi: "Phòng Họp 1",                  en: "Meeting Room 1",    ja: "会議室-1",         zh: "会议室-1" },
  "会議室-1":                      { vi: "Phòng Họp 1",                  en: "Meeting Room 1",    ja: "会議室-1",         zh: "会议室-1" },
  "会议室-1":                      { vi: "Phòng Họp 1",                  en: "Meeting Room 1",    ja: "会議室-1",         zh: "会议室-1" },
  "Phòng Họp 2":                  { vi: "Phòng Họp 2",                  en: "Meeting Room 2",    ja: "会議室-2",         zh: "会议室-2" },
  "Meeting Room 2":               { vi: "Phòng Họp 2",                  en: "Meeting Room 2",    ja: "会議室-2",         zh: "会议室-2" },
  "会議室-2":                      { vi: "Phòng Họp 2",                  en: "Meeting Room 2",    ja: "会議室-2",         zh: "会议室-2" },
  "会议室-2":                      { vi: "Phòng Họp 2",                  en: "Meeting Room 2",    ja: "会議室-2",         zh: "会议室-2" },
  "sự-kiện":                      { vi: "sự-kiện",                      en: "events",            ja: "イベント",         zh: "活动"     },
  "events":                       { vi: "sự-kiện",                      en: "events",            ja: "イベント",         zh: "活动"     },
  "イベント":                      { vi: "sự-kiện",                      en: "events",            ja: "イベント",         zh: "活动"     },
  "活动":                          { vi: "sự-kiện",                      en: "events",            ja: "イベント",         zh: "活动"     },
  "ý-kiến-và-phản-hồi":          { vi: "ý-kiến-và-phản-hồi",          en: "feedback",          ja: "フィードバック",   zh: "反馈"     },
  "feedback":                     { vi: "ý-kiến-và-phản-hồi",          en: "feedback",          ja: "フィードバック",   zh: "反馈"     },
  "フィードバック":                { vi: "ý-kiến-và-phản-hồi",          en: "feedback",          ja: "フィードバック",   zh: "反馈"     },
  "反馈":                          { vi: "ý-kiến-và-phản-hồi",          en: "feedback",          ja: "フィードバック",   zh: "反馈"     },
  "Nơi Tập Trung Cộng Đồng":     { vi: "Nơi Tập Trung Cộng Đồng",     en: "Community Hub",     ja: "コミュニティハブ", zh: "社区中心" },
  "Community Hub":                { vi: "Nơi Tập Trung Cộng Đồng",     en: "Community Hub",     ja: "コミュニティハブ", zh: "社区中心" },
  "コミュニティハブ":              { vi: "Nơi Tập Trung Cộng Đồng",     en: "Community Hub",     ja: "コミュニティハブ", zh: "社区中心" },
  "社区中心":                      { vi: "Nơi Tập Trung Cộng Đồng",     en: "Community Hub",     ja: "コミュニティハブ", zh: "社区中心" },
};

type Lang = "vi" | "en" | "ja" | "zh";

/**
 * Returns the localised version of a system category name.
 * If the name is not a known system name, returns it unchanged.
 */
export function translateCategoryName(name: string, lang: string): string {
  return CATEGORY_MAP[name]?.[lang as Lang] ?? name;
}

/**
 * Returns the localised version of a system channel name.
 * If the name is not a known system name, returns it unchanged.
 */
export function translateChannelName(name: string, lang: string): string {
  return CHANNEL_MAP[name]?.[lang as Lang] ?? name;
}
