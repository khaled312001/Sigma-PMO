import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { NotificationsService } from './notifications.service';
import type { NotificationsStatus } from './notifications.service';

interface TestEmailBody {
  to: string;
}

/**
 * `/notifications` — visibility + proof for the outbound channels
 * (Mr. Ayham acceptance 2026-07-01: "prove sending a report or alert from the
 * platform"). `GET /status` reports which channels are configured WITHOUT ever
 * exposing a secret (the SMTP URL embeds the password); `POST /test-email`
 * sends a one-off test to prove the SMTP pathway works end-to-end.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('status')
  @RequiresCapability('canRead')
  @ApiOperation({
    summary: 'Outbound channel status (email/slack/teams) — enabled/disabled + from-address only, never a secret.',
  })
  status(): NotificationsStatus {
    return this.notifications.getStatus();
  }

  @Post('test-email')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  @ApiOperation({
    summary: 'Send a one-off test email to prove the SMTP channel. 400 when SMTP is not configured.',
  })
  async testEmail(@Body() body: TestEmailBody): Promise<{ delivered: boolean; to: string }> {
    const to = body?.to?.trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      throw new BadRequestException('A valid "to" email address is required.');
    }
    try {
      const delivered = await this.notifications.sendTestEmail(to);
      return { delivered, to };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
