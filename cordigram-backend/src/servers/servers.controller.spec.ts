import { Test, TestingModule } from '@nestjs/testing';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { ServerAccessService } from '../access/server-access.service';

describe('ServersController safety/audit endpoints', () => {
  let controller: ServersController;
  const serversServiceMock = {
    getServerSafetySettings: jest.fn(),
    updateServerSafetySettings: jest.fn(),
    getServerAuditLogs: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServersController],
      providers: [
        { provide: ServersService, useValue: serversServiceMock },
        { provide: ServerAccessService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ServersController>(ServersController);
  });

  it('should call getServerSafetySettings with serverId + userId', async () => {
    serversServiceMock.getServerSafetySettings.mockResolvedValue({
      spamProtection: {},
    });
    const req = { user: { userId: 'u1' } };
    await controller.getSafetySettings('s1', req);
    expect(serversServiceMock.getServerSafetySettings).toHaveBeenCalledWith(
      's1',
      'u1',
    );
  });

  it('should call updateServerSafetySettings with patch body', async () => {
    serversServiceMock.updateServerSafetySettings.mockResolvedValue({
      automod: {},
    });
    const req = { user: { userId: 'u2' } };
    const body = { automod: { bannedWords: ['abc'] } };
    await controller.updateSafetySettings('s2', body, req);
    expect(serversServiceMock.updateServerSafetySettings).toHaveBeenCalledWith(
      's2',
      'u2',
      body,
    );
  });

  it('should map audit query params correctly', async () => {
    serversServiceMock.getServerAuditLogs.mockResolvedValue([]);
    const req = { user: { userId: 'u3' } };
    await controller.getServerAuditLogs(
      's3',
      req,
      'channel.update',
      'u1',
      '25',
      '2026-01-01T00:00:00.000Z',
    );
    expect(serversServiceMock.getServerAuditLogs).toHaveBeenCalledWith(
      's3',
      'u3',
      {
        action: 'channel.update',
        actorUserId: 'u1',
        limit: 25,
        before: '2026-01-01T00:00:00.000Z',
      },
    );
  });
});
