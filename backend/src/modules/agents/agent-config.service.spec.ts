import { BadRequestException } from '@nestjs/common';

import { SettingsService } from '../settings/settings.service';
import { AgentConfigService } from './agent-config.service';

/**
 * AgentConfigService — the per-agent enable/disable + model-tier store backing
 * the orchestrator's 409 gate. Uses an in-memory SettingsService stub.
 */
function stubSettings(): SettingsService {
  const store = new Map<string, string>();
  return {
    getPlaintext: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => { store.set(k, v); },
  } as unknown as SettingsService;
}

describe('AgentConfigService', () => {
  it('defaults an unconfigured agent to enabled / default tier', async () => {
    const svc = new AgentConfigService(stubSettings());
    expect(await svc.getFor('l2.validation')).toEqual({ enabled: true, modelTier: 'default' });
    expect(await svc.isEnabled('l2.validation')).toBe(true);
  });

  it('persists a disable and reflects it on isEnabled', async () => {
    const settings = stubSettings();
    const svc = new AgentConfigService(settings);
    await svc.setFor('l5.risk', { enabled: false }, 'admin');
    expect(await svc.isEnabled('l5.risk')).toBe(false);
    // Other agents untouched.
    expect(await svc.isEnabled('l2.validation')).toBe(true);
  });

  it('merges a partial patch over the current value', async () => {
    const svc = new AgentConfigService(stubSettings());
    await svc.setFor('l7.executive', { enabled: false }, null);
    const merged = await svc.setFor('l7.executive', { modelTier: 'claude-opus' }, null);
    expect(merged).toEqual({ enabled: false, modelTier: 'claude-opus' });
  });

  it('rejects an unknown model tier', async () => {
    const svc = new AgentConfigService(stubSettings());
    await expect(svc.setFor('l2.validation', { modelTier: 'gpt-4' as never }, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('survives a corrupt stored document by falling back to defaults', async () => {
    const settings = stubSettings();
    await settings.set('agents.config', 'not-json', null);
    const svc = new AgentConfigService(settings);
    expect(await svc.getAll()).toEqual({});
    expect(await svc.isEnabled('l3.compliance')).toBe(true);
  });
});
