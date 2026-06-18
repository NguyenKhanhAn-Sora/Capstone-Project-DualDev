import '../../../core/services/language_controller.dart';

/// Kaomoji categories — parity `cordigram-web/components/ChatEmojiPicker/ChatEmojiPicker.tsx`.
class ChatKaomojiCategory {
  const ChatKaomojiCategory({required this.label, required this.items});

  final String label;
  final List<String> items;
}

List<ChatKaomojiCategory> get chatKaomojiCategories => [
  ChatKaomojiCategory(
    label: LanguageController.instance.t('messages.kaomoji.happy'),
    items: [
      '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
      '(*^▽^*)',
      '(≧◡≦)',
      'ヽ(•‿•)ﾉ',
      '(*≧▽≦)',
      '(´･ω･`)',
      '(•‿•)',
      '(＾▽＾)',
    ],
  ),
  ChatKaomojiCategory(
    label: LanguageController.instance.t('messages.kaomoji.love'),
    items: [
      '(♡˙︶˙♡)',
      '(ˆ ³ˆ)♥',
      '( ˘ ³˘)♥',
      '(●´ω｀●)',
      '(˘ε˘)',
      '(｡♥‿♥｡)',
      '(づ｡◕‿‿◕｡)づ',
    ],
  ),
  ChatKaomojiCategory(
    label: LanguageController.instance.t('messages.kaomoji.sad'),
    items: ['(╥_╥)', '(T_T)', '(；′⌒｀)', 'ಥ_ಥ', '(｡•́︿•̀｡)', '(╯︵╰,)'],
  ),
  ChatKaomojiCategory(
    label: LanguageController.instance.t('messages.kaomoji.funny'),
    items: ['( ͡° ͜ʖ ͡°)', '¯\\_(ツ)_/¯', 'ʕ•ᴥ•ʔ', '(งʼ̀-ʼ́)ง', '(ง •̀_•́)ง'],
  ),
  ChatKaomojiCategory(
    label: LanguageController.instance.t('messages.kaomoji.wave'),
    items: ['( ´ ▽ ` )ﾉ', '(*ﾟ▽ﾟ*)/', '(＾ゞ^)', 'ヾ(^∇^)', 'o(^▽^)o'],
  ),
];
