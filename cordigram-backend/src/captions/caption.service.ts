import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post } from '../posts/post.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqTranscriptResponse {
  language: string;
  duration: number;
  text: string;
  segments: GroqSegment[];
}

const TARGET_LANGS = ['vi', 'en', 'zh', 'ja'] as const;
type TargetLang = (typeof TARGET_LANGS)[number];

const LANG_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
};

// Whisper sometimes returns full names or regional variants — normalise to short codes
const LANG_NORMALIZE: Record<string, string> = {
  english: 'en',
  vietnamese: 'vi',
  japanese: 'ja',
  chinese: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  mandarin: 'zh',
  korean: 'ko',
  french: 'fr',
  spanish: 'es',
  german: 'de',
};

@Injectable()
export class CaptionService {
  private readonly logger = new Logger(CaptionService.name);
  private readonly groqApiKey = process.env.GROQ_API_KEY ?? '';
  private readonly groqWhisperUrl =
    'https://api.groq.com/openai/v1/audio/transcriptions';
  private readonly groqChatUrl =
    'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async generateAndSave(postId: string, mediaIndex: number): Promise<void> {
    const post = await this.postModel.findById(postId).lean();
    if (!post) return;

    const mediaItem = post.media?.[mediaIndex];
    if (!mediaItem || mediaItem.type !== 'video' || !mediaItem.url) return;

    await this.postModel
      .updateOne(
        { _id: post._id },
        { $set: { [`media.${mediaIndex}.captionStatus`]: 'pending' } },
      )
      .exec();

    try {
      // ── 1. Download video ────────────────────────────────────────────────────
      const videoResp = await fetch(mediaItem.url);
      if (!videoResp.ok)
        throw new Error(`Video download failed: HTTP ${videoResp.status}`);
      const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

      // ── 2. Transcribe via Groq Whisper ───────────────────────────────────────
      const form = new FormData();
      form.append(
        'file',
        new Blob([videoBuffer], { type: 'video/mp4' }),
        'video.mp4',
      );
      form.append('model', 'whisper-large-v3');
      form.append('response_format', 'verbose_json');

      const groqResp = await fetch(this.groqWhisperUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.groqApiKey}` },
        body: form,
      });

      if (!groqResp.ok) {
        const errBody = await groqResp.text();
        throw new Error(`Groq Whisper error ${groqResp.status}: ${errBody}`);
      }

      const transcript = (await groqResp.json()) as GroqTranscriptResponse;

      // No speech detected — mark done without any caption files
      if (!transcript.segments?.length || !transcript.text?.trim()) {
        await this.postModel
          .updateOne(
            { _id: post._id },
            { $set: { [`media.${mediaIndex}.captionStatus`]: 'done' } },
          )
          .exec();
        return;
      }

      const detectedLang = this.normalizeLang(transcript.language);

      // ── 3. Cloudinary upload helper ──────────────────────────────────────────
      const authorId = post.authorId.toString();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const folder = `${process.env.CLOUDINARY_FOLDER ?? 'cordigram/uploads'}/captions/${authorId}/${year}/${month}`;

      const uploadVtt = async (
        vttContent: string,
        suffix: string,
      ): Promise<string> => {
        const result = await this.cloudinary.uploadBuffer({
          buffer: Buffer.from(vttContent, 'utf-8'),
          folder,
          publicId: `${postId}-${mediaIndex}-${suffix}`,
          resourceType: 'raw',
          overwrite: true,
        });
        return result.secureUrl;
      };

      // ── 4. Upload original-language VTT ─────────────────────────────────────
      const originalVtt = this.toWebVTT(transcript.segments);
      const originalUrl = await uploadVtt(originalVtt, detectedLang);

      const captionTracks: Array<{ lang: string; url: string }> = [
        { lang: detectedLang, url: originalUrl },
      ];

      // ── 5. Translate to each target language in parallel ─────────────────────
      const transLangs = (TARGET_LANGS as readonly string[]).filter(
        (l) => l !== detectedLang,
      ) as TargetLang[];

      const translationResults = await Promise.allSettled(
        transLangs.map(async (targetLang) => {
          const translatedTexts = await this.translateSegments(
            transcript.segments,
            detectedLang,
            targetLang,
          );
          const translatedSegments = transcript.segments.map((seg, i) => ({
            ...seg,
            text: translatedTexts[i] ?? seg.text,
          }));
          const vtt = this.toWebVTT(translatedSegments);
          const url = await uploadVtt(vtt, targetLang);
          return { lang: targetLang as string, url };
        }),
      );

      for (const res of translationResults) {
        if (res.status === 'fulfilled') {
          captionTracks.push(res.value);
        } else {
          this.logger.warn(`Caption translation failed: ${String(res.reason)}`);
        }
      }

      // ── 6. Persist captionTracks + backward-compat single fields ─────────────
      await this.postModel
        .updateOne(
          { _id: post._id },
          {
            $set: {
              [`media.${mediaIndex}.captionUrl`]: originalUrl,
              [`media.${mediaIndex}.captionLanguage`]: detectedLang,
              [`media.${mediaIndex}.captionTracks`]: captionTracks,
              [`media.${mediaIndex}.captionStatus`]: 'done',
            },
          },
        )
        .exec();

      this.logger.log(
        `Caption done — post=${postId} media[${mediaIndex}] lang=${detectedLang} tracks=${captionTracks.length}`,
      );
    } catch (err) {
      this.logger.error(
        `Caption failed — post=${postId} media[${mediaIndex}]: ${String(err)}`,
      );
      await this.postModel
        .updateOne(
          { _id: post._id },
          { $set: { [`media.${mediaIndex}.captionStatus`]: 'failed' } },
        )
        .exec()
        .catch(() => undefined);
    }
  }

  // ── Translation ──────────────────────────────────────────────────────────────

  private normalizeLang(lang: string): string {
    const lower = lang.toLowerCase();
    return LANG_NORMALIZE[lower] ?? lower;
  }

  private async translateSegments(
    segments: GroqSegment[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    const CHUNK_SIZE = 60;
    const allTexts = segments.map((s) => s.text.trim());
    const translated: string[] = [];

    for (let i = 0; i < allTexts.length; i += CHUNK_SIZE) {
      const chunk = allTexts.slice(i, i + CHUNK_SIZE);
      const result = await this.translateChunk(chunk, sourceLang, targetLang);
      translated.push(...result);
    }

    return translated;
  }

  private async translateChunk(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    const srcName = LANG_NAMES[sourceLang] ?? sourceLang;
    const tgtName = LANG_NAMES[targetLang] ?? targetLang;

    const resp = await fetch(this.groqChatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a subtitle translator. Translate each string in the JSON array from ${srcName} to ${tgtName}. Return ONLY a valid JSON array with exactly the same number of elements in the same order. Do not add explanations or markdown.`,
          },
          {
            role: 'user',
            content: JSON.stringify(texts),
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!resp.ok) {
      throw new Error(
        `Groq chat error ${resp.status}: ${await resp.text()}`,
      );
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

    // Strip markdown code fences if model wraps output
    const jsonStr = raw
      .replace(/^```json?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(jsonStr) as unknown[];
    if (!Array.isArray(parsed) || parsed.length !== texts.length) {
      throw new Error(
        `Translation length mismatch: expected ${texts.length}, got ${parsed.length}`,
      );
    }

    return parsed.map((v) => String(v));
  }

  // ── VTT helpers ──────────────────────────────────────────────────────────────

  private toWebVTT(segments: GroqSegment[]): string {
    const lines: string[] = ['WEBVTT', ''];
    for (const seg of segments) {
      const text = seg.text.trim();
      if (!text) continue;
      lines.push(
        `${this.fmtVttTime(seg.start)} --> ${this.fmtVttTime(seg.end)}`,
      );
      lines.push(text);
      lines.push('');
    }
    return lines.join('\n');
  }

  private fmtVttTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return (
      String(h).padStart(2, '0') +
      ':' +
      String(m).padStart(2, '0') +
      ':' +
      s.toFixed(3).padStart(6, '0')
    );
  }
}
