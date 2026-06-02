import { Injectable, Logger } from '@nestjs/common';

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 500_000; // 500 KB

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  async fetch(rawUrl: string): Promise<LinkPreviewData> {
    const url = rawUrl.startsWith('http://') ? rawUrl.replace('http://', 'https://') : rawUrl;

    const empty: LinkPreviewData = {
      url,
      title: null,
      description: null,
      image: null,
      siteName: null,
      favicon: null,
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; CordigramBot/1.0; +https://cordigram.com)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return empty;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return empty;

      // Read at most MAX_BODY_BYTES to avoid large payloads
      const buffer = await res.arrayBuffer();
      const html = new TextDecoder().decode(
        buffer.byteLength > MAX_BODY_BYTES
          ? buffer.slice(0, MAX_BODY_BYTES)
          : buffer,
      );

      return { url, ...this.parseMetaTags(html, url) };
    } catch (err) {
      this.logger.warn(`LinkPreview fetch failed for ${url}: ${String(err)}`);
      return empty;
    }
  }

  private parseMetaTags(
    html: string,
    pageUrl: string,
  ): Omit<LinkPreviewData, 'url'> {
    const pick = (pattern: RegExp): string | null => {
      const m = html.match(pattern);
      return m ? this.decodeHtmlEntities(m[1].trim()) : null;
    };

    const ogTitle =
      pick(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i);

    const twitterTitle =
      pick(/name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i);

    const pageTitle = pick(/<title[^>]*>([^<]{1,300})<\/title>/i);

    const ogDesc =
      pick(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i);

    const twitterDesc =
      pick(/name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*name=["']twitter:description["']/i);

    const metaDesc =
      pick(/name=["']description["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*name=["']description["']/i);

    const ogImage =
      pick(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

    const twitterImage =
      pick(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

    const ogSiteName =
      pick(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ??
      pick(/content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);

    const origin = (() => {
      try { return new URL(pageUrl).origin; } catch { return ''; }
    })();

    const rawImage = ogImage ?? twitterImage ?? null;
    const resolvedImage = rawImage
      ? this.resolveUrl(rawImage, origin)
      : null;

    const faviconMatch =
      pick(/rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ??
      pick(/href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    const favicon = faviconMatch ? this.resolveUrl(faviconMatch, origin) : `${origin}/favicon.ico`;

    return {
      title: ogTitle ?? twitterTitle ?? pageTitle,
      description: ogDesc ?? twitterDesc ?? metaDesc,
      image: resolvedImage,
      siteName: ogSiteName ?? this.hostnameToSiteName(pageUrl),
      favicon,
    };
  }

  private resolveUrl(href: string, base: string): string {
    if (href.startsWith('//')) return 'https:' + href;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/') && base) return base + href;
    return href;
  }

  private hostnameToSiteName(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private decodeHtmlEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
