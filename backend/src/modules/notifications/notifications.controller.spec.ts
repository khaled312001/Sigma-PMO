import { BadRequestException } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import type { NotificationsService, NotificationsStatus } from './notifications.service';

/** Minimal NotificationsService stub — we only exercise the controller. */
function makeService(overrides: Partial<NotificationsService> = {}): NotificationsService {
  const status: NotificationsStatus = {
    email: { enabled: false, configuredVia: null, from: 'info@sigma-pmo.com', requiredEnv: ['EMAIL_SMTP_URL'] },
    slackEnabled: false,
    teamsEnabled: false,
  };
  return {
    getStatus: jest.fn(() => status),
    sendTestEmail: jest.fn(async () => true),
    ...overrides,
  } as unknown as NotificationsService;
}

describe('NotificationsController', () => {
  it('GET /status returns the channel status without any secret', () => {
    const svc = makeService();
    const res = new NotificationsController(svc).status();
    expect(res.email.requiredEnv).toEqual(['EMAIL_SMTP_URL']);
    expect(res.email.from).toBe('info@sigma-pmo.com');
    // No SMTP URL (which embeds user:pass) anywhere in the payload; the
    // from-address (info@sigma-pmo.com) is safe to expose.
    expect(JSON.stringify(res)).not.toMatch(/smtps?:\/\/|:\/\/[^"]*:[^"]*@/i);
  });

  it('POST /test-email rejects an invalid address with 400', async () => {
    const ctrl = new NotificationsController(makeService());
    await expect(ctrl.testEmail({ to: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POST /test-email answers 400 when SMTP is not configured', async () => {
    const svc = makeService({
      sendTestEmail: jest.fn(async () => {
        throw new Error('SMTP not configured — set EMAIL_SMTP_URL or the /admin/settings email SMTP URL.');
      }),
    });
    const ctrl = new NotificationsController(svc);
    await expect(ctrl.testEmail({ to: 'owner@sigma-pmo.com' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('POST /test-email sends and echoes the recipient when enabled', async () => {
    const svc = makeService({ sendTestEmail: jest.fn(async () => true) });
    const ctrl = new NotificationsController(svc);
    const res = await ctrl.testEmail({ to: 'owner@sigma-pmo.com' });
    expect(res).toEqual({ delivered: true, to: 'owner@sigma-pmo.com' });
    expect(svc.sendTestEmail).toHaveBeenCalledWith('owner@sigma-pmo.com');
  });
});
