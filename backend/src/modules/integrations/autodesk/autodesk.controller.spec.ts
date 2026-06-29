import { AutodeskController } from './autodesk.controller';
import { AutodeskApsService, AutodeskStatus } from './autodesk-aps.service';
import { BimModelService } from '../../clashes/bim-model.service';

/**
 * GET /integrations/autodesk/status must return the UI-friendly status shape:
 * a clear enabled flag, `configuredVia` (settings|env|null), the base host, and
 * the EXACT required env vars — and it must NEVER carry a secret value (Req R3).
 */
describe('AutodeskController status shape', () => {
  function makeController(status: AutodeskStatus): { controller: AutodeskController; aps: AutodeskApsService } {
    const aps = {
      getStatus: jest.fn(async () => status),
    } as unknown as AutodeskApsService;
    const bim = {} as unknown as BimModelService;
    return { controller: new AutodeskController(aps, bim), aps };
  }

  it('returns a disabled shape (configuredVia null) with the required env vars when no creds', async () => {
    const status: AutodeskStatus = {
      enabled: false,
      credentialSource: 'none',
      configuredVia: null,
      baseUrl: 'https://developer.api.autodesk.com',
      requiredEnv: ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'],
      reachable: null,
      detail: null,
    };
    const { controller, aps } = makeController(status);

    const res = await controller.status();

    expect(aps.getStatus).toHaveBeenCalledWith(false);
    expect(res.enabled).toBe(false);
    expect(res.configuredVia).toBeNull();
    expect(res.requiredEnv).toEqual(['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET']);
    // The exact required-env statement: only client id + secret; NO callback/3-legged var.
    expect(res.requiredEnv).not.toContain('AUTODESK_BASE_URL');
    expect(res.requiredEnv.some((v) => /CALLBACK|SCOPE|REDIRECT/i.test(v))).toBe(false);
    // Hard guarantee: the status payload never leaks a secret-bearing field.
    // `requiredEnv` legitimately lists the PUBLIC variable NAME
    // 'AUTODESK_CLIENT_SECRET' (documentation, not a value), so exclude it from
    // the secret-value leak scan; nothing else may contain "secret".
    expect(Object.keys(res)).not.toContain('clientSecret');
    expect(JSON.stringify({ ...res, requiredEnv: undefined })).not.toMatch(/secret/i);
  });

  it('maps the encrypted SystemSetting source to configuredVia=settings when enabled', async () => {
    const status: AutodeskStatus = {
      enabled: true,
      credentialSource: 'db',
      configuredVia: 'settings',
      baseUrl: 'https://developer.api.autodesk.com',
      requiredEnv: ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'],
      reachable: true,
      detail: null,
    };
    const { controller } = makeController(status);

    const res = await controller.status('true');

    expect(res.enabled).toBe(true);
    expect(res.configuredVia).toBe('settings');
  });

  it('passes probe=true through to the service', async () => {
    const status: AutodeskStatus = {
      enabled: true,
      credentialSource: 'env',
      configuredVia: 'env',
      baseUrl: 'https://developer.api.autodesk.com',
      requiredEnv: ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'],
      reachable: null,
      detail: null,
    };
    const { controller, aps } = makeController(status);

    await controller.status('1');
    expect(aps.getStatus).toHaveBeenCalledWith(true);
  });
});
