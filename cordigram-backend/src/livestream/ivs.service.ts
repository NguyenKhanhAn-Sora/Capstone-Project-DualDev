import { Injectable, Logger } from '@nestjs/common';
import {
  CreateChannelCommand,
  CreateStreamKeyCommand,
  DeleteChannelCommand,
  IvsClient,
} from '@aws-sdk/client-ivs';
import { ConfigService } from '../config/config.service';

@Injectable()
export class IvsService {
  private readonly logger = new Logger(IvsService.name);
  private readonly client: IvsClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new IvsClient({
      region: this.configService.ivsRegion,
      credentials:
        this.configService.ivsAccessKeyId && this.configService.ivsSecretAccessKey
          ? {
              accessKeyId: this.configService.ivsAccessKeyId,
              secretAccessKey: this.configService.ivsSecretAccessKey,
            }
          : undefined,
    });
  }

  get enabled(): boolean {
    return this.configService.livestreamHqProvider === 'ivs';
  }

  async createChannelForStream(params: {
    streamId: string;
    latencyMode: 'adaptive' | 'balanced' | 'low';
  }): Promise<{
    channelArn: string;
    playbackUrl: string;
    ingestEndpoint: string;
    streamKey: string;
  }> {
    const latency = params.latencyMode === 'low' ? 'LOW' : 'NORMAL';

    const created = await this.client.send(
      new CreateChannelCommand({
        name: `live-${params.streamId}-${Date.now().toString(36)}`,
        latencyMode: latency,
        type: 'STANDARD',
      }),
    );

    const channelArn = created.channel?.arn ?? '';
    const playbackUrl = created.channel?.playbackUrl ?? '';
    const ingestEndpoint = created.channel?.ingestEndpoint ?? '';

    if (!channelArn || !playbackUrl || !ingestEndpoint) {
      throw new Error('Unable to create AWS IVS channel');
    }

    const streamKeyRes = await this.client.send(
      new CreateStreamKeyCommand({
        channelArn,
      }),
    );

    const streamKey = streamKeyRes.streamKey?.value ?? '';
    if (!streamKey) {
      throw new Error('Unable to create AWS IVS stream key');
    }

    return {
      channelArn,
      playbackUrl,
      ingestEndpoint,
      streamKey,
    };
  }

  async deleteChannelSafe(channelArn?: string | null): Promise<void> {
    if (!channelArn) return;

    try {
      await this.client.send(
        new DeleteChannelCommand({
          arn: channelArn,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `deleteChannelSafe failed arn=${channelArn} err=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
