/// Kaomoji categories — parity `cordigram-web/components/ChatEmojiPicker/ChatEmojiPicker.tsx`.
class ChatKaomojiCategory {
  const ChatKaomojiCategory({required this.label, required this.items});

  final String label;
  final List<String> items;
}

const chatKaomojiCategories = <ChatKaomojiCategory>[
  ChatKaomojiCategory(
    label: 'Vui / Phấn khích',
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
    label: 'Yêu thương',
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
    label: 'Buồn / Khóc',
    items: ['(╥_╥)', '(T_T)', '(；′⌒｀)', 'ಥ_ಥ', '(｡•́︿•̀｡)', '(╯︵╰,)'],
  ),
  ChatKaomojiCategory(
    label: 'Hài hước',
    items: ['( ͡° ͜ʖ ͡°)', '¯\\_(ツ)_/¯', 'ʕ•ᴥ•ʔ', '(งʼ̀-ʼ́)ง', '(ง •̀_•́)ง'],
  ),
  ChatKaomojiCategory(
    label: 'Chào / Vẫy',
    items: ['( ´ ▽ ` )ﾉ', '(*ﾟ▽ﾟ*)/', '(＾ゞ^)', 'ヾ(^∇^)', 'o(^▽^)o'],
  ),
];
