import { Injectable } from '@nestjs/common';

const DEEPL_TARGET_MAP: Record<string, string> = {
  vi: 'VI',
  en: 'EN-US',
  ja: 'JA',
  zh: 'ZH',
};

@Injectable()
export class TranslationService {
  private get apiKey(): string {
    return process.env.DEEPL_API_KEY ?? '';
  }

  private get baseUrl(): string {
    return this.apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2'
      : 'https://api.deepl.com/v2';
  }

  private toDeepLTarget(lang: string): string {
    return DEEPL_TARGET_MAP[lang.toLowerCase()] ?? lang.toUpperCase();
  }

  async translate(
    text: string,
    targetLang: string,
  ): Promise<{ translatedText: string; detectedSourceLang: string }> {
    const body = new URLSearchParams({
      text,
      target_lang: this.toDeepLTarget(targetLang),
    });

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`DeepL error ${response.status}`);
    }

    const data = (await response.json()) as {
      translations: Array<{ detected_source_language: string; text: string }>;
    };

    const t = data.translations[0];
    return {
      translatedText: t.text,
      detectedSourceLang: t.detected_source_language.toLowerCase(),
    };
  }

  async detectLanguage(text: string): Promise<string | null> {
    if (!text?.trim()) return null;
    try {
      const { detectedSourceLang } = await this.translate(text, 'en');
      return detectedSourceLang;
    } catch {
      return null;
    }
  }
}
