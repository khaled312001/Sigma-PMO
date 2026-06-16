import { Module } from '@nestjs/common';

import { ClashesModule } from '../clashes/clashes.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { SettingsModule } from '../settings/settings.module';
import { AutodeskController } from './autodesk/autodesk.controller';
import { AutodeskApsService } from './autodesk/autodesk-aps.service';
import { EmailModule } from './email/email.module';
import { P6ClientService } from './p6/p6-client.service';
import { P6SyncController } from './p6/p6-sync.controller';
import { P6WebhookController } from './p6/p6-webhook.controller';

/**
 * External integrations:
 *  - Primavera P6 — inbound webhook (file push) + the LIVE outbound EPPM REST
 *    pull (`P6ClientService` + `P6SyncController`).
 *  - Autodesk APS — live BIM/Revit/IFC translation + quantity extraction
 *    (`AutodeskApsService` + `AutodeskController`), feeding the same `bim-model`
 *    surface the Quantity-Survey pipeline consumes (via `ClashesModule`'s
 *    `BimModelService`).
 *  - Email — outbound notification channel.
 *
 * Both live connectors read their credentials from the encrypted `SystemSetting`
 * store (SettingsModule) with an env fallback — set them at /admin/settings.
 */
@Module({
  imports: [IngestionModule, EmailModule, SettingsModule, ClashesModule],
  controllers: [P6WebhookController, P6SyncController, AutodeskController],
  providers: [P6ClientService, AutodeskApsService],
  exports: [EmailModule, P6ClientService, AutodeskApsService],
})
export class IntegrationsModule {}
