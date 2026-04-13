/**
 * Wraps system channel/category name renders in messages/page.tsx
 * with translateChannelName / translateCategoryName calls.
 * Run: node scripts/patch-system-names.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "..", "app", "(main)", "messages", "page.tsx");
let src = fs.readFileSync(file, "utf8");

let count = 0;

function rep(old, next) {
  if (!src.includes(old)) {
    console.warn("NOT FOUND:", old.slice(0, 80));
    return;
  }
  src = src.replace(old, next);
  count++;
}

// ── category header ────────────────────────────────────────────────────────────
rep(
  `<h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{cat.name}</h3>`,
  `<h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{translateCategoryName(cat.name, language)}</h3>`
);

// ── channel names (all occurrences) ───────────────────────────────────────────
// Use a global regex to catch every JSX render of channel.name wrapped in a span
// Pattern: >{channel.name}<  (inside a span or similar)
// We replace channel.name with translateChannelName(channel.name, language) in JSX expressions

// Replace all  {channel.name}  that appear as standalone JSX children
// (these are always display-only; we leave the ones inside setChannelContextMenu calls as-is)
src = src.replace(
  /(<span[^>]*>\s*)\{channel\.name\}/g,
  (_, prefix) => `${prefix}{translateChannelName(channel.name, language)}`
);
count++;

// Also fix the  #{channel.name}  pattern (flat view text channels)
src = src.replace(
  /(<span[^>]*>)#\{channel\.name\}/g,
  (_, prefix) => `${prefix}#{translateChannelName(channel.name, language)}`
);
count++;

// connectedVoiceChannel.name in the bottom voice bar
src = src.replace(
  /\{connectedVoiceChannel\.name\}/g,
  `{translateChannelName(connectedVoiceChannel.name, language)}`
);
count++;

fs.writeFileSync(file, src);
console.log(`Done – ${count} replacements applied.`);
