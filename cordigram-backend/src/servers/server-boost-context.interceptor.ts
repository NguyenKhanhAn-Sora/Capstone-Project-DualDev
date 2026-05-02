import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ServersService } from './servers.service';

@Injectable()
export class ServerBoostContextInterceptor implements NestInterceptor {
  constructor(private readonly serversService: ServersService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<any>();
    const serverId = String(req?.params?.id ?? '').trim();
    if (!serverId) return next.handle();

    try {
      const server = await this.serversService.getServerById(serverId);
      req.serverBoostedByUserIds = Array.isArray(
        (server as any)?.boostedByUserIds,
      )
        ? (server as any).boostedByUserIds
        : [];
    } catch {
      req.serverBoostedByUserIds = [];
    }
    return next.handle();
  }
}
