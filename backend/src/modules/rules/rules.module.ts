import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { GovernanceModule } from '../governance/governance.module';
import { ReviewWorkflowService } from './review-workflow.service';
import { RuleEngineService } from './rule-engine.service';
import { RulesController } from './rules.controller';
import { BaselineDurationOutlierRule } from './rules/baseline-duration-outlier.rule';
import { CostOverrunRule } from './rules/cost-overrun.rule';
import { DataCompletenessRule } from './rules/data-completeness.rule';
import { DurationOverrunRule } from './rules/duration-overrun.rule';
import { MissingWeeklyReportRule } from './rules/missing-weekly-report.rule';
import { ReportedVsScheduleMismatchRule } from './rules/reported-vs-schedule-mismatch.rule';
import { ResourceUnderuseRule } from './rules/resource-underuse.rule';
import { ScheduleBehindPlanRule } from './rules/schedule-behind-plan.rule';
import { ScheduleFinishSlippedRule } from './rules/schedule-finish-slipped.rule';
import { StaleReportingRule } from './rules/stale-reporting.rule';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [CanonicalModule, GovernanceModule],
  controllers: [RulesController],
  providers: [
    SnapshotService,
    RuleEngineService,
    ReviewWorkflowService,
    ScheduleFinishSlippedRule,
    ScheduleBehindPlanRule,
    DurationOverrunRule,
    CostOverrunRule,
    ResourceUnderuseRule,
    StaleReportingRule,
    BaselineDurationOutlierRule,
    ReportedVsScheduleMismatchRule,
    MissingWeeklyReportRule,
    DataCompletenessRule,
  ],
  exports: [RuleEngineService, SnapshotService],
})
export class RulesModule {}
