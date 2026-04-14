import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';

export type CommentLinkPreview = {
  url: string;
  canonicalUrl: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
};

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);
  private readonly maxUrls = 3;
  private readonly timeoutMs = 4000;

  async extractFromText(text: string): Promise<CommentLinkPreview[]> {
    const urls = this.extractUrls(text);
    if (!urls.length) return [];

    const previews = await Promise.all(
      urls.map((url) => this.fetchPreview(url)),
    );
    return previews.filter((item): item is CommentLinkPreview => Boolean(item));
  }

  private extractUrls(text: string): string[] {
    if (!text) return [];
    const regex = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
    const matches = text.match(regex) ?? [];

    const cleaned = matches
      .map((raw) => raw.replace(/[),.;!?]+$/g, '').trim())
      .filter(Boolean);

    const unique = Array.from(new Set(cleaned));

    return unique.slice(0, this.maxUrls);
  }

  private async fetchPreview(
    rawUrl: string,
  ): Promise<CommentLinkPreview | null> {
    try {
      const parsed = new URL(rawUrl);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }

      if (this.isBlockedHost(parsed.hostname)) {
        return null;
      }

      if (this.isYouTubeHost(parsed.hostname)) {
        const youtubePreview = await this.fetchYouTubeOembed(parsed);
        if (youtubePreview) {
          return youtubePreview;
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(parsed.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; CordigramBot/1.0; +https://cordigram.local)',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          return null;
        }

        const contentType =
          response.headers.get('content-type')?.toLowerCase() ?? '';
        if (
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml+xml')
        ) {
          return null;
        }

        const finalUrl = new URL(response.url || parsed.toString());
        if (this.isBlockedHost(finalUrl.hostname)) {
          return null;
        }

        const html = (await response.text()).slice(0, 500_000);
        const preview = this.parseHtml(finalUrl, html);

        if (!preview.title && !preview.description && !preview.image) {
          return null;
        }

        return preview;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return null;
    }
  }

  private async fetchYouTubeOembed(
    sourceUrl: URL,
  ): Promise<CommentLinkPreview | null> {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl.toString())}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (compatible; CordigramBot/1.0; +https://cordigram.local)',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };

      const title = this.cleanText(data?.title ?? null);
      const siteName = this.cleanText(data?.author_name ?? null) ?? 'YouTube';
      const image = this.resolveUrl(data?.thumbnail_url ?? null, sourceUrl);

      if (!title && !image) {
        return null;
      }

      return {
        url: sourceUrl.toString(),
        canonicalUrl: sourceUrl.toString(),
        domain: sourceUrl.hostname,
        siteName,
        title,
        description: null,
        image,
        favicon: 'https://www.youtube.com/favicon.ico',
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseHtml(baseUrl: URL, html: string): CommentLinkPreview {
    const title =
      this.extractMeta(html, 'property', 'og:title') ??
      this.extractMeta(html, 'name', 'twitter:title') ??
      this.extractTitle(html);

    const description =
      this.extractMeta(html, 'property', 'og:description') ??
      this.extractMeta(html, 'name', 'twitter:description') ??
      this.extractMeta(html, 'name', 'description');

    const imageRaw =
      this.extractMeta(html, 'property', 'og:image') ??
      this.extractMeta(html, 'name', 'twitter:image');

    const siteName =
      this.extractMeta(html, 'property', 'og:site_name') ?? baseUrl.hostname;

    const canonicalRaw = this.extractLinkHref(html, 'canonical');
    const faviconRaw =
      this.extractLinkHref(html, 'icon') ??
      this.extractLinkHref(html, 'shortcut icon') ??
      '/favicon.ico';

    return {
      url: baseUrl.toString(),
      canonicalUrl:
        this.resolveUrl(canonicalRaw, baseUrl) ?? baseUrl.toString(),
      domain: baseUrl.hostname,
      siteName: this.cleanText(siteName),
      title: this.cleanText(title),
      description: this.cleanText(description),
      image: this.resolveUrl(imageRaw, baseUrl),
      favicon: this.resolveUrl(faviconRaw, baseUrl),
    };
  }

  private extractMeta(
    html: string,
    keyName: 'property' | 'name',
    keyValue: string,
  ): string | null {
    const pattern = new RegExp(
      `<meta[^>]*${keyName}\\s*=\\s*(["'])${this.escapeRegex(keyValue)}\\1[^>]*content\\s*=\\s*(["'])(.*?)\\2[^>]*>`,
      'i',
    );

    const reversePattern = new RegExp(
      `<meta[^>]*content\\s*=\\s*(["'])(.*?)\\1[^>]*${keyName}\\s*=\\s*(["'])${this.escapeRegex(keyValue)}\\3[^>]*>`,
      'i',
    );

    const direct = html.match(pattern)?.[3] ?? null;
    if (direct) return direct;

    const reverse = html.match(reversePattern)?.[2] ?? null;
    return reverse;
  }

  private extractTitle(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return titleMatch?.[1] ?? null;
  }

  private extractLinkHref(html: string, relValue: string): string | null {
    const relPattern = new RegExp(
      `<link[^>]*rel\\s*=\\s*(["'])[^"']*${this.escapeRegex(relValue)}[^"']*\\1[^>]*href\\s*=\\s*(["'])(.*?)\\2[^>]*>`,
      'i',
    );

    const reversePattern = new RegExp(
      `<link[^>]*href\\s*=\\s*(["'])(.*?)\\1[^>]*rel\\s*=\\s*(["'])[^"']*${this.escapeRegex(relValue)}[^"']*\\3[^>]*>`,
      'i',
    );

    return (
      html.match(relPattern)?.[3] ?? html.match(reversePattern)?.[2] ?? null
    );
  }

  private cleanText(value: string | null): string | null {
    if (!value) return null;
    const decoded = this.decodeHtml(value).replace(/\s+/g, ' ').trim();
    return decoded || null;
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&nbsp;/gi, ' ');
  }

  private resolveUrl(value: string | null, baseUrl: URL): string | null {
    if (!value) return null;
    try {
      const resolved = new URL(value, baseUrl).toString();
      return resolved;
    } catch {
      return null;
    }
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isYouTubeHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com')
    );
  }

  private isBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    ) {
      return true;
    }

    if (isIP(host) === 4) {
      const [a, b] = host.split('.').map((part) => Number(part));
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 0) return true;
    }

    if (isIP(host) === 6) {
      if (host === '::1') return true;
      if (host.startsWith('fc') || host.startsWith('fd')) return true;
      if (host.startsWith('fe80:')) return true;
    }

    return false;
  }
}
