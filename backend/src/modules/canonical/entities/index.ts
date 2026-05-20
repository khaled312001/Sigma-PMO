import { Activity } from './activity.entity';
import { IngestionRun } from './ingestion-run.entity';
import { Project } from './project.entity';
import { Report } from './report.entity';
import { Resource } from './resource.entity';
import { ResourceAssignment } from './resource-assignment.entity';
import { SourceFile } from './source-file.entity';

export {
  Activity,
  IngestionRun,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  SourceFile,
};

/** All canonical ORM entities, for TypeOrmModule.forFeature registration. */
export const CANONICAL_ENTITIES = [
  SourceFile,
  IngestionRun,
  Project,
  Activity,
  Resource,
  Report,
  ResourceAssignment,
];
