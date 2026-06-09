import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as https from 'https';

const JAMENDO_CLIENT_ID = '7a016a16';
const JAMENDO_BASE_HOST = 'api.jamendo.com';
const JAMENDO_BASE_PATH = '/v3.0';

export type JamendoTrack = {
  id: string;
  name: string;
  artist_name: string;
  image: string;
  audio: string;
  audiodownload: string;
  duration: number;
  shareurl: string;
};

@Injectable()
export class MusicService {
  private fetchJamendo(path: string, params: Record<string, string | number>): Promise<any> {
    const query = new URLSearchParams({
      client_id: JAMENDO_CLIENT_ID,
      format: 'json',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const fullPath = `${JAMENDO_BASE_PATH}${path}?${query.toString()}`;

    return new Promise((resolve, reject) => {
      const req = https.get(
        { hostname: JAMENDO_BASE_HOST, path: fullPath, headers: { 'Accept': 'application/json' } },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(new InternalServerErrorException('Invalid JSON from Jamendo')); }
          });
        },
      );
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new InternalServerErrorException('Jamendo API timeout'));
      });
      req.on('error', (err) => {
        reject(new InternalServerErrorException('Jamendo request failed: ' + err.message));
      });
    });
  }

  async searchTracks(q: string, limit = 20, offset = 0): Promise<JamendoTrack[]> {
    const data = await this.fetchJamendo('/tracks/', {
      search: q,
      limit,
      offset,
      include: 'musicinfo',
      imagesize: 200,
    });
    return (data.results ?? []) as JamendoTrack[];
  }

  async getTrendingTracks(limit = 20, offset = 0): Promise<JamendoTrack[]> {
    const data = await this.fetchJamendo('/tracks/', {
      order: 'popularity_total',
      limit,
      offset,
      include: 'musicinfo',
      imagesize: 200,
    });
    return (data.results ?? []) as JamendoTrack[];
  }
}
