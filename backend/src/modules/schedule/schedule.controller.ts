import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Scenario } from '../canonical/entities';
import { CpmResult, CpmService } from './cpm.service';
import { RecoveryPlanService, RecoveryProposal } from './recovery-plan.service';

/** Body for `POST /schedule/recovery/propose`. */
class ProposeRecoveryBody {
  @ApiProperty({ description: 'Project businessKey to plan recovery for.' })
  projectKey!: string;

  @ApiProperty({ required: false, description: 'Target finish date (ISO) to recover to.' })
  targetFinishIso?: string | null;
}

/** Body for `POST /schedule/recovery/apply`. */
class ApplyRecoveryBody {
  @ApiProperty({ description: 'Recovery-plan Scenario id.' })
  scenarioId!: string;

  @ApiProperty({ description: 'Index of the chosen option in the proposal.' })
  optionIndex!: number;

  @ApiProperty({ description: 'Approver display/id.' })
  approvedBy!: string;
}

/**
 * Schedule analytics surface — CPM solve + (Task 4) recovery planning.
 *
 * `GET /projects/:projectKey/cpm` returns the solved logic-network critical
 * path (ES/EF/LS/LF/float/isCritical + critical-path keys) derived from the
 * persisted `Activity.predecessors[]` graph (Mr. Ayham acceptance 2026-06-28).
 * Path lives under `/projects/...` so it reads as a project sub-resource while
 * the solver stays in its own module (no canonical→schedule cycle).
 */
@ApiTags('schedule')
@Controller()
export class ScheduleController {
  constructor(
    private readonly cpm: CpmService,
    private readonly recovery: RecoveryPlanService,
  ) {}

  @Get('projects/:projectKey/cpm')
  @RequiresCapability('canRead')
  @ApiOkResponse({ description: 'Solved CPM network for the project (critical path + float).' })
  solveCpm(@Param('projectKey') projectKey: string): Promise<CpmResult> {
    return this.cpm.solve(projectKey);
  }

  /**
   * Propose crash / fast-track / re-sequence recovery options for a (late)
   * project, each re-run through the CPM solver to show recovered days + cost.
   * Persists the proposal append-only as a Scenario.
   */
  @Post('schedule/recovery/propose')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  @ApiOkResponse({ description: 'Recovery options (crash/fast-track/re-sequence) with recovered days + cost.' })
  proposeRecovery(@Body() body: ProposeRecoveryBody): Promise<RecoveryProposal> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.recovery.propose(body.projectKey, body.targetFinishIso ?? null);
  }

  /** List the persisted recovery-plan proposals for a project. */
  @Get('schedule/recovery')
  @RequiresCapability('canRead')
  @ApiOkResponse({ description: 'Persisted recovery-plan scenarios for the project.' })
  listRecovery(@Query('projectKey') projectKey?: string): Promise<Scenario[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.recovery.listByProject(projectKey);
  }

  /** Apply a chosen recovery option → append-only revised Activity versions. */
  @Post('schedule/recovery/apply')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  @ApiOkResponse({ description: 'Applies a recovery option, producing new Activity versions.' })
  applyRecovery(
    @Body() body: ApplyRecoveryBody,
  ): Promise<{ scenarioId: string; revisedActivityKeys: string[]; revisionNumber: number }> {
    if (!body?.scenarioId) throw new BadRequestException('scenarioId is required');
    if (body?.optionIndex == null) throw new BadRequestException('optionIndex is required');
    if (!body?.approvedBy) throw new BadRequestException('approvedBy is required');
    return this.recovery.applyOption(body);
  }
}
