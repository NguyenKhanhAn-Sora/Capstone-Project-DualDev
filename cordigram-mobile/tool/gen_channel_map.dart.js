const fs = require("fs");
const s = fs.readFileSync(
  "../cordigram-web/lib/system-names.ts",
  "utf8",
);
const marker = "const CHANNEL_MAP";
const i = s.indexOf(marker);
if (i < 0) throw new Error("no CHANNEL_MAP");
const start = s.indexOf("{", i);
let depth = 0;
let end = -1;
for (let k = start; k < s.length; k++) {
  const c = s[k];
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      end = k + 1;
      break;
    }
  }
}
const body = s.slice(start, end);
const obj = new Function("return " + body)();

function escDart(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$");
}

let out =
  "// GENERATED from cordigram-web/lib/system-names.ts CHANNEL_MAP — do not edit by hand\n";
out += "const Map<String, Map<String, String>> kSystemChannelMap = {\n";
for (const [key, val] of Object.entries(obj)) {
  out += "  '" + escDart(key) + "': {\n";
  for (const [lk, lv] of Object.entries(val)) {
    out += "    '" + lk + "': '" + escDart(lv) + "',\n";
  }
  out += "  },\n";
}
out += "};\n";
fs.writeFileSync(
  "lib/features/messages/search/system_channel_map.generated.dart",
  out,
);
console.log("wrote", out.split("\n").length, "lines");
