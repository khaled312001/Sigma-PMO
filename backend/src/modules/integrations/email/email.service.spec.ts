import { ConfigService } from '@nestjs/config';

import { EmailService } from './email.service';
import { SETTING_KEYS } from '../../settings/settings.service';

const sendMail = jest.fn(async () => ({ accepted: ['x@y.z'] }));
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

function config(vals: Record<string, string>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('EmailService', () => {
  beforeEach(() => sendMail.mockClear());

  it('is disabled when neither setting nor env is present', async () => {
    const svc = new EmailService(config({}));
    await svc.onModuleInit();
    expect(svc.isEnabled()).toBe(false);
    expect(svc.getStatus()).toMatchObject({ enabled: false, configuredVia: null, requiredEnv: ['EMAIL_SMTP_URL'] });
    expect(await svc.send({ to: 'a@b.c', subject: 's', text: 't' })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('uses the env SMTP URL when no encrypted setting exists (configuredVia=env)', async () => {
    const svc = new EmailService(config({ emailSmtpUrl: 'smtp://u:p@host:587', emailFrom: 'info@sigma-pmo.com' }));
    await svc.onModuleInit();
    expect(svc.getStatus()).toMatchObject({ enabled: true, configuredVia: 'env', from: 'info@sigma-pmo.com' });
    // The status never leaks the URL/password.
    expect(JSON.stringify(svc.getStatus())).not.toMatch(/smtp:\/\/|:p@/);
  });

  it('prefers the encrypted setting over env (configuredVia=settings)', async () => {
    const settings = { getPlaintext: jest.fn(async () => 'smtp://db:pw@host:465'), onChange: jest.fn() } as never;
    const svc = new EmailService(config({ emailSmtpUrl: 'smtp://env:env@host:587' }), settings);
    await svc.onModuleInit();
    expect(svc.getStatus().configuredVia).toBe('settings');
    expect(svc.isEnabled()).toBe(true);
  });

  it('sends with a PDF attachment when enabled', async () => {
    const svc = new EmailService(config({ emailSmtpUrl: 'smtp://u:p@host:587', emailFrom: 'info@sigma-pmo.com' }));
    await svc.onModuleInit();
    const ok = await svc.send({
      to: 'owner@sigma-pmo.com',
      subject: 'report',
      text: 'body',
      attachments: [{ filename: 'r.pdf', content: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' }],
    });
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0] as { from: string; attachments: Array<{ filename: string }> };
    expect(arg.from).toBe('info@sigma-pmo.com');
    expect(arg.attachments[0].filename).toBe('r.pdf');
  });
});
