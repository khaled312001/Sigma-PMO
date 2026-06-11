import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer } from '../../common/enums';
import {
  Activity,
  AgentExecution,
  ConfidenceScore,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { ProjectRecordService } from './project-record.service';

/**
 * L1 Data Collection Agent (Mr. Ayham's Layer 1) — collects and structures
 * project information from every source family (Primavera schedules + BIM +
 * BoQ + drawings already land via their own ingestion; this agent adds the
 * RFI/Submittal/NCR/Change-Request/Procurement/Resource/Cost/Site-Photo
 * records and reports the collected data inventory). Completing L1 makes the
 * full L1→L8 pipeline run every layer.
 */
@Injectable()
export class DataCollectionAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    private readonly records: ProjectRecordService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l1.data_collection',
      layer: AgentLayer.L1_DATA_COLLECTION,
      objective:
        'Collect and structure project information from BIM, Primavera, daily ' +
        'reports, site photos, RFIs, submittals, NCRs, change requests, ' +
        'procurement/resource/cost logs and other project documents.',
      inputs: ['ingested schedules/BIM/BoQ/drawings', 'project records (RFI/NCR/CR/…)'],
      outputs: ['structured canonical activities + project-record inventory', 'data-collection completeness'],
      ruleReferences: ['Sigma data-collection SOP', 'ISO 19650 (BIM)'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l1.data_collection');

    const inventory = await this.records.inventory(projectKey);
    const recordTotal = Object.values(inventory).reduce((s, n) => s + n, 0);
    const activityCount = await this.activities.count({ where: { isCurrent: true } });

    // Completeness confidence: schedule present + breadth of record families.
    const familiesPresent = Object.keys(inventory).length;
    const completeness = Math.max(
      0.4,
      Math.min(1, (activityCount > 0 ? 0.5 : 0) + Math.min(0.5, familiesPresent * 0.08)),
    );

    return {
      outputRefs: { recordInventory: inventory, recordTotal, activityCount, familiesPresent },
      confidence: { overall: Math.round(completeness * 1000) / 1000, completeness, breakdown: { familiesPresent, rule: 'data-collection-completeness-v1' } },
      outboxEvents: [
        { eventType: 'agent.l1.data_collection.completed', payload: { projectKey, recordTotal, familiesPresent } },
      ],
      summary: `Data collection for ${projectKey}: ${activityCount} activities, ${recordTotal} record(s) across ${familiesPresent} famil(ies).`,
    };
  }
}
