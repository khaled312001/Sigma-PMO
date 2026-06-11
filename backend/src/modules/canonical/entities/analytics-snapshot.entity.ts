import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * AnalyticsSnapshot — an append-only Earned-Value + KPI snapshot for one node
 * at one point in time (Mr. Ayham's L4 Analytics outputs). Append-only so the
 * trend/forecasting views read a time series straight from the table.
 */
@Entity('analytics_snapshot')
@Index(['nodeBusinessKey', 'computedAt'])
export class AnalyticsSnapshot extends UuidEntity {
  @Column({ type: 'varchar', length: 16 })
  nodeType!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  nodeBusinessKey!: string;

  /** EVM result: bac/pv/ev/ac/sv/cv/spi/cpi/eac/etc/vac. */
  @Column({ type: 'json' })
  evm!: Record<string, unknown>;

  /** Productivity + progress KPIs (planned vs actual, completion rate, …). */
  @Column({ type: 'json' })
  productivity!: Record<string, unknown>;

  /** Forecast block (forecast finish, projected overrun, trend). */
  @Column({ type: 'json', nullable: true })
  forecast!: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'datetime', precision: 6 })
  computedAt!: Date;
}
