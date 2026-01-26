export type StickerItem = {
  id: string;
  url: string;
  label: string;
};

export type StickerCategory = {
  id: string;
  label: string;
  items: StickerItem[];
};

export const stickerCategories: StickerCategory[] = [
  {
    id: "reactions",
    label: "Reactions",
    items: [
      {
        id: "thumbs-up",
        label: "Thumbs up",
        url: "/stickers/reactions/thumbs-up.svg",
      },
      {
        id: "heart",
        label: "Heart",
        url: "/stickers/reactions/heart.svg",
      },
      {
        id: "laugh",
        label: "Laugh",
        url: "/stickers/reactions/laugh.svg",
      },
      {
        id: "wow",
        label: "Wow",
        url: "/stickers/reactions/wow.svg",
      },
    ],
  },
  {
    id: "celebration",
    label: "Celebration",
    items: [
      {
        id: "party",
        label: "Party",
        url: "/stickers/celebration/party.svg",
      },
      {
        id: "star",
        label: "Star",
        url: "/stickers/celebration/star.svg",
      },
      {
        id: "confetti",
        label: "Confetti",
        url: "/stickers/celebration/confetti.svg",
      },
      {
        id: "cake",
        label: "Cake",
        url: "/stickers/celebration/cake.svg",
      },
    ],
  },
  {
    id: "love",
    label: "Love",
    items: [
      {
        id: "hug",
        label: "Hug",
        url: "/stickers/love/hug.svg",
      },
      {
        id: "kiss",
        label: "Kiss",
        url: "/stickers/love/kiss.svg",
      },
      {
        id: "rose",
        label: "Rose",
        url: "/stickers/love/rose.svg",
      },
      {
        id: "sparkle-heart",
        label: "Sparkle heart",
        url: "/stickers/love/sparkle-heart.svg",
      },
    ],
  },
];
