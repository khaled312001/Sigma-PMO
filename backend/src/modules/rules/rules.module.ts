import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { RuleEngineService } from './rule-engine.service';
import { RulesController } from './rules.controller';
import { CostOverrunRule } from './rules/cost-overrun.rule';
import { DurationOverrunRule } from './rules/duration-overrun.rule';
import { ResourceUnderuseRule } from './rules/resource-underuse.rule';
import { ScheduleBehindPlanRule } from './rules/schedule-behind-plan.rule';
import { ScheduleFinishSlippedRule } from './rules/schedule-finish-slipped.rule';
import { StaleReportingRule } from './rules/stale-reporting.rule';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [CanonicalModule],
  controllers: [RulesController],
  providers: [
    SnapshotService,
    RuleEngineService,
    ScheduleFinishSlippedRule,
    ScheduleBehindPlanRule,
    DurationOverrunRule,
    CostOverrunRule,
    ResourceUnderuseRule,
    StaleReportingRule,
  ],
  exports: [RuleEngineService, SnapshotService],
})
export class RulesModule {}
