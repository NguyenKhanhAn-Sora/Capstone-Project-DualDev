#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const WORKING_DIR = process.cwd();
const MESSAGES_DIR = path.join(WORKING_DIR, "messages");
const SOURCE_LOCALE = "en";
const SOURCE_FILE = path.join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`);

const TARGET_LOCALES = ["es", "fr", "de", "pt-BR", "ru", "ja", "ko", "zh"];
const DEEPL_TARGET_MAP = {
  es: "ES",
  fr: "FR",
  de: "DE",
  "pt-BR": "PT-BR",
  ru: "RU",
  ja: "JA",
  ko: "KO",
  zh: "ZH",
};

const BATCH_SIZE = 50;
const PLACEHOLDER_REGEX = /\{[^{}]+\}/g;

function parseArgs(argv) {
  const args = {
    force: false,
    target: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--force") {
      args.force = true;
      continue;
    }
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (value === "--target") {
      args.target = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  return args;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(filePath, serialized, "utf8");
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function collectStringLeaves(node, currentPath = [], output = []) {
  if (typeof node === "string") {
    output.push({ path: currentPath, value: node });
    return output;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      collectStringLeaves(item, [...currentPath, index], output);
    });
    return output;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      collectStringLeaves(value, [...currentPath, key], output);
    }
  }

  return output;
}

function getAtPath(node, pathParts) {
  let current = node;
  for (const part of pathParts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function setAtPath(node, pathParts, value) {
  let current = node;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const part = pathParts[index];
    const nextPart = pathParts[index + 1];
    if (current[part] == null) {
      current[part] = typeof nextPart === "number" ? [] : {};
    }
    current = current[part];
  }
  const finalPart = pathParts[pathParts.length - 1];
  current[finalPart] = value;
}

function protectPlaceholders(inputText) {
  const placeholders = [];
  const protectedText = inputText.replace(PLACEHOLDER_REGEX, (match) => {
    const index = placeholders.length;
    placeholders.push(match);
    return `<x id=\"${index}\"/>`;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(inputText, placeholders) {
  return inputText
    .replace(/<x id=\"(\d+)\"\s*\/>/g, (_match, index) => placeholders[Number(index)] ?? "")
    .replace(/<x id=(\d+)\s*\/>/g, (_match, index) => placeholders[Number(index)] ?? "");
}

async function deeplTranslateBatch({ apiKey, sourceLang, targetLang, texts }) {
  const endpoint =
    process.env.DEEPL_API_URL?.trim() || "https://api-free.deepl.com/v2/translate";

  const body = new URLSearchParams();
  body.set("source_lang", sourceLang);
  body.set("target_lang", targetLang);
  body.set("preserve_formatting", "1");
  body.set("split_sentences", "nonewlines");
  body.set("tag_handling", "xml");
  body.set("ignore_tags", "x");

  texts.forEach((text) => body.append("text", text));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DeepL request failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  if (!payload?.translations || !Array.isArray(payload.translations)) {
    throw new Error("DeepL response did not contain translations array");
  }

  return payload.translations.map((item) => String(item.text || ""));
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DEEPL_API_KEY?.trim();

  if (!apiKey && !args.dryRun) {
    throw new Error("Missing DEEPL_API_KEY. Set the env var before running this script.");
  }

  const sourceMessages = await readJson(SOURCE_FILE);
  const sourceLeaves = collectStringLeaves(sourceMessages);

  const targets = args.target
    ? [args.target]
    : TARGET_LOCALES;

  for (const locale of targets) {
    if (!DEEPL_TARGET_MAP[locale]) {
      throw new Error(`Unsupported target locale for DeepL: ${locale}`);
    }

    const targetFile = path.join(MESSAGES_DIR, `${locale}.json`);
    let targetMessages = {};
    try {
      targetMessages = await readJson(targetFile);
    } catch {
      targetMessages = JSON.parse(JSON.stringify(sourceMessages));
    }

    const leavesToTranslate = sourceLeaves.filter(({ path: itemPath }) => {
      if (args.force) return true;
      const existing = getAtPath(targetMessages, itemPath);
      return typeof existing !== "string" || !existing.trim();
    });

    if (!leavesToTranslate.length) {
      console.log(`[${locale}] no missing keys, skipping`);
      continue;
    }

    console.log(`[${locale}] translating ${leavesToTranslate.length} entries`);

    const prepared = leavesToTranslate.map(({ path: itemPath, value }) => {
      const { protectedText, placeholders } = protectPlaceholders(value);
      return { path: itemPath, placeholders, protectedText };
    });

    const chunks = chunkArray(prepared, BATCH_SIZE);
    for (const chunk of chunks) {
      const inputTexts = chunk.map((item) => item.protectedText);
      const translatedTexts = args.dryRun
        ? inputTexts
        : await deeplTranslateBatch({
            apiKey,
            sourceLang: "EN",
            targetLang: DEEPL_TARGET_MAP[locale],
            texts: inputTexts,
          });

      translatedTexts.forEach((translatedText, index) => {
        const current = chunk[index];
        const restored = restorePlaceholders(translatedText, current.placeholders);
        setAtPath(targetMessages, current.path, restored);
      });
    }

    if (!args.dryRun) {
      await writeJson(targetFile, targetMessages);
      console.log(`[${locale}] written to ${path.relative(WORKING_DIR, targetFile)}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
