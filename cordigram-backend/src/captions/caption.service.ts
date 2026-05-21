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

@Injectable()
export class CaptionService {
  private readonly logger = new Logger(CaptionService.name);
  private readonly groqApiKey = process.env.GROQ_API_KEY ?? '';
  private readonly groqUrl =
    'https://api.groq.com/openai/v1/audio/transcriptions';

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * Downloads the video at mediaIndex, transcribes it via Groq Whisper,
   * converts the result to WebVTT, uploads to Cloudinary and saves the URL
   * back to the post document.
   */
  async generateAndSave(postId: string, mediaIndex: number): Promise<void> {
    const post = await this.postModel.findById(postId).lean();
    if (!post) return;

    const mediaItem = post.media?.[mediaIndex];
    if (!mediaItem || mediaItem.type !== 'video' || !mediaItem.url) return;

    // Mark as pending so the frontend can show a loading indicator
    await this.postModel
      .updateOne(
        { _id: post._id },
        { $set: { [`media.${mediaIndex}.captionStatus`]: 'pending' } },
      )
      .exec();

    try {
      // ── 1. Download video ────────────────────────────────────────────────────
      const videoResp = await fetch(mediaItem.url);
      if (!videoResp.ok) {
        throw new Error(`Video download failed: HTTP ${videoResp.status}`);
      }
      const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

      // ── 2. Call Groq Whisper API ─────────────────────────────────────────────
      // No language param → Whisper auto-detects (supports 100+ languages)
      const form = new FormData();
      form.append(
        'file',
        new Blob([videoBuffer], { type: 'video/mp4' }),
        'video.mp4',
      );
      form.append('model', 'whisper-large-v3');
      form.append('response_format', 'verbose_json');

      const groqResp = await fetch(this.groqUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.groqApiKey}` },
        body: form,
      });

      if (!groqResp.ok) {
        const errBody = await groqResp.text();
        throw new Error(`Groq API error ${groqResp.status}: ${errBody}`);
      }

      const transcript = (await groqResp.json()) as GroqTranscriptResponse;

      // No speech in the video — mark done without a caption file
      if (!transcript.segments?.length || !transcript.text?.trim()) {
        await this.postModel
          .updateOne(
            { _id: post._id },
            { $set: { [`media.${mediaIndex}.captionStatus`]: 'done' } },
          )
          .exec();
        return;
      }

      // ── 3. Convert to WebVTT ─────────────────────────────────────────────────
      const vttContent = this.toWebVTT(transcript.segments);
      const vttBuffer = Buffer.from(vttContent, 'utf-8');

      // ── 4. Upload VTT file to Cloudinary (raw resource type) ─────────────────
      const authorId = post.authorId.toString();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const folder = `${process.env.CLOUDINARY_FOLDER ?? 'cordigram/uploads'}/captions/${authorId}/${year}/${month}`;

      const uploadResult = await this.cloudinary.uploadBuffer({
        buffer: vttBuffer,
        folder,
        publicId: `${postId}-${mediaIndex}`,
        resourceType: 'raw',
        overwrite: true,
      });

      // ── 5. Persist caption URL + detected language back to the post ──────────
      await this.postModel
        .updateOne(
          { _id: post._id },
          {
            $set: {
              [`media.${mediaIndex}.captionUrl`]: uploadResult.secureUrl,
              [`media.${mediaIndex}.captionLanguage`]: transcript.language,
              [`media.${mediaIndex}.captionStatus`]: 'done',
            },
          },
        )
        .exec();

      this.logger.log(
        `Caption done — post=${postId} media[${mediaIndex}] lang=${transcript.language}`,
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private toWebVTT(segments: GroqSegment[]): string {
    const lines: string[] = ['WEBVTT', ''];
    for (const seg of segments) {
      const text = seg.text.trim();
      if (!text) continue;
      lines.push(`${this.fmtVttTime(seg.start)} --> ${this.fmtVttTime(seg.end)}`);
      lines.push(text);
      lines.push('');
    }
    return lines.join('\n');
  }

  /** Converts seconds to WebVTT timestamp format: HH:MM:SS.mmm */
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
