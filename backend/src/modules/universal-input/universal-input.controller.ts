import { Body, Controller, Get, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { UniversalInputService } from './universal-input.service';
import type { AnalyzeDto, CommitDecision } from './universal-input.service';

/**
 * Universal Input (Mr. Ayham, 2026-06-19). One general entry point: the user
 * uploads/pastes ANY project information, the AI extracts + maps it to the Sigma
 * layers, and returns a staged proposal for review. Nothing is committed to the
 * official records until the user confirms via /commit — and every decision
 * (confirm / correct / exclude / assumption / missing / limited-confidence) is
 * recorded in the audit log.
 */
@Controller('input')
export class UniversalInputController {
  constructor(
    private readonly svc: UniversalInputService,
    private readonly auth: AuthService,
  ) {}

  /** The Sigma layer taxonomy the AI maps to (for the UI legend). */
  @Get('layers')
  @RequiresCapability('canRead')
  layers() {
    return { layers: this.svc.layers() };
  }

  /** Analyse raw input (files + pasted text) → a staged, AI-mapped proposal. */
  @Post('analyze')
  @HttpCode(200)
  @Throttle({ ai: { limit: 20, ttl: 60_000 } })
  @RequiresCapability('canIngestSchedule')
  async analyze(@Headers('x-api-key') rawKey: string | undefined, @Body() body: AnalyzeDto) {
    return this.svc.analyze(body, await this.caller(rawKey));
  }

  /** The caller's recent proposals. */
  @Get('proposals')
  @RequiresCapability('canRead')
  async list(@Headers('x-api-key') rawKey?: string) {
    return this.svc.list(await this.caller(rawKey));
  }

  /** One proposal (for the review screen). */
  @Get('proposals/:id')
  @RequiresCapability('canRead')
  async get(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.get(id, await this.caller(rawKey));
  }

  /** Commit the user-reviewed items into the official Sigma records. */
  @Post('proposals/:id/commit')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async commit(
    @Param('id') id: string,
    @Headers('x-api-key') rawKey: string | undefined,
    @Body() body: { decisions: CommitDecision[] },
  ) {
    return this.svc.commit(id, body?.decisions ?? [], await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
