import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1780487150828 implements MigrationInterface {
    name = 'Init1780487150828'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`activity\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`businessKey\` varchar(255) NOT NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`rawSource\` json NOT NULL, \`projectId\` char(36) NOT NULL, \`wbsCode\` varchar(128) NULL, \`name\` varchar(512) NOT NULL, \`activityType\` varchar(64) NULL, \`status\` varchar(64) NULL, \`plannedStart\` date NULL, \`plannedFinish\` date NULL, \`actualStart\` date NULL, \`actualFinish\` date NULL, \`plannedDurationDays\` double NULL, \`remainingDurationDays\` double NULL, \`plannedPctComplete\` double NULL, \`actualPctComplete\` double NULL, \`budgetedCost\` decimal(18,2) NULL, \`actualCost\` decimal(18,2) NULL, INDEX \`IDX_8e73bf318eb4d2fd414dacb6a1\` (\`ingestionRunId\`), INDEX \`IDX_6d14e91e57a976a7fb272620c5\` (\`sourceFileId\`), INDEX \`IDX_a34288f4929a34608f6a432d59\` (\`businessKey\`), INDEX \`IDX_e3909786113681f86ff50bf536\` (\`isCurrent\`), INDEX \`IDX_5a898f44fa31ef7916f0c38b01\` (\`projectId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`alert\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`code\` varchar(64) NOT NULL, \`severity\` varchar(16) NOT NULL, \`summary\` varchar(1024) NOT NULL, \`projectId\` char(36) NOT NULL, \`activityId\` char(36) NULL, \`resourceId\` char(36) NULL, \`assignmentId\` char(36) NULL, \`reportId\` char(36) NULL, \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`ruleEvaluationId\` char(36) NOT NULL, \`context\` json NOT NULL, INDEX \`IDX_70267403c8591e1225af7e6fb0\` (\`code\`), INDEX \`IDX_b52a542544bc2b02efed8a008d\` (\`severity\`), INDEX \`IDX_d97a302d6e27cb7ac9b935e692\` (\`projectId\`), INDEX \`IDX_ff07fbf7417010e3750f37041d\` (\`activityId\`), INDEX \`IDX_24f7ba116929c80933072902de\` (\`ingestionRunId\`), INDEX \`IDX_c6b7ce8de0988641cd672bd6bc\` (\`ruleEvaluationId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`confidence_score\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`completeness\` double NOT NULL, \`consistency\` double NOT NULL, \`sourceReliability\` double NOT NULL, \`overall\` double NOT NULL, \`breakdown\` json NOT NULL, UNIQUE INDEX \`IDX_ca8020140b848ea57e5e207bc7\` (\`ingestionRunId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`decision_review\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`decisionId\` char(36) NOT NULL, \`alertId\` char(36) NOT NULL, \`action\` varchar(16) NOT NULL, \`performedByUserId\` char(36) NULL, \`performedByDisplay\` varchar(255) NULL, \`comment\` text NULL, INDEX \`IDX_f637d88c63042280de73d3db98\` (\`decisionId\`), INDEX \`IDX_d9cf33bf550dc599a635d68d18\` (\`alertId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`executive_summary\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`projectId\` char(36) NOT NULL, \`periodStart\` date NOT NULL, \`periodEnd\` date NOT NULL, \`groundedNarrative\` text NOT NULL, \`narrative\` text NOT NULL, \`source\` varchar(16) NOT NULL, \`llmProvider\` varchar(64) NULL, \`llmModel\` varchar(128) NULL, \`ruleEvaluationId\` char(36) NULL, \`confidenceAverage\` double NOT NULL, \`metrics\` json NOT NULL, INDEX \`IDX_673a9bb3d11880663c71f5f365\` (\`projectId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`governance_decision\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`alertId\` char(36) NOT NULL, \`policyId\` char(36) NOT NULL, \`policyVersion\` int NOT NULL, \`responsibleParty\` varchar(32) NOT NULL, \`fidicClause\` varchar(64) NULL, \`fidicNotice\` varchar(512) NULL, \`fidicDeadlineDays\` int NULL, \`escalationLevel\` varchar(8) NOT NULL, \`notifyParties\` json NOT NULL, \`interventions\` json NOT NULL, \`rationale\` text NOT NULL, INDEX \`IDX_ae7e705493bce9c84d87544573\` (\`alertId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`governance_policy\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`projectKey\` varchar(255) NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`authoredBy\` varchar(255) NULL, \`config\` json NOT NULL, INDEX \`IDX_60d5736e628845dac3b4edd27c\` (\`projectKey\`), INDEX \`IDX_fac3752be08cba1833e7c62c54\` (\`isCurrent\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`ingestion_run\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`sourceFileId\` char(36) NOT NULL, \`parser\` varchar(64) NOT NULL, \`status\` varchar(32) NOT NULL DEFAULT 'pending', \`startedAt\` datetime(6) NULL, \`finishedAt\` datetime(6) NULL, \`validationPassed\` tinyint NULL, \`rowCounts\` json NOT NULL, \`summary\` json NOT NULL, INDEX \`IDX_25bd46496fbe0a49dfd0f2e3a0\` (\`sourceFileId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`project\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`businessKey\` varchar(255) NOT NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`rawSource\` json NOT NULL, \`name\` varchar(512) NOT NULL, \`status\` varchar(64) NULL, \`clientName\` varchar(255) NULL, \`currency\` varchar(8) NULL, \`dataDate\` date NULL, \`plannedStart\` date NULL, \`plannedFinish\` date NULL, \`actualStart\` date NULL, \`actualFinish\` date NULL, \`budgetAtCompletion\` decimal(18,2) NULL, INDEX \`IDX_0f5c0cbccd0c094ba37e5e622d\` (\`ingestionRunId\`), INDEX \`IDX_4f8a7475a3c5505426e330d1c8\` (\`sourceFileId\`), INDEX \`IDX_5483dd9be9478d0a94a3478899\` (\`businessKey\`), INDEX \`IDX_cb06496b3a528dfcae8f483218\` (\`isCurrent\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`report\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`businessKey\` varchar(255) NOT NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`rawSource\` json NOT NULL, \`projectId\` char(36) NOT NULL, \`reportType\` varchar(16) NOT NULL, \`reportDate\` date NOT NULL, \`periodStart\` date NULL, \`periodEnd\` date NULL, \`submittedBy\` varchar(255) NULL, \`reportedPctComplete\` double NULL, \`narrative\` text NULL, \`metrics\` json NOT NULL, INDEX \`IDX_1de0ab103b40fdf795bb343497\` (\`ingestionRunId\`), INDEX \`IDX_af25da5598fe79db4f6005604d\` (\`sourceFileId\`), INDEX \`IDX_7f652745a10f2b65e68bcae0b4\` (\`businessKey\`), INDEX \`IDX_3f8b2cdc0dedeac8be8b850405\` (\`isCurrent\`), INDEX \`IDX_3eba0feef825edc97946b47323\` (\`projectId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`resource\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`businessKey\` varchar(255) NOT NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`rawSource\` json NOT NULL, \`projectId\` char(36) NULL, \`name\` varchar(512) NOT NULL, \`resourceType\` varchar(32) NOT NULL, \`unitOfMeasure\` varchar(32) NULL, \`maxUnitsPerDay\` double NULL, \`standardRate\` decimal(18,2) NULL, INDEX \`IDX_e69f3bb83713786957aa7598e9\` (\`ingestionRunId\`), INDEX \`IDX_d755a60969466f3942a4fd0cb9\` (\`sourceFileId\`), INDEX \`IDX_00ed02c8f90d07f97d760c6676\` (\`businessKey\`), INDEX \`IDX_4e88e4a4dbbbfd31edb32e9663\` (\`isCurrent\`), INDEX \`IDX_ba509a0a92e7d2778e75416e75\` (\`projectId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`resource_assignment\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`ingestionRunId\` char(36) NOT NULL, \`sourceFileId\` char(36) NOT NULL, \`businessKey\` varchar(255) NOT NULL, \`version\` int NOT NULL DEFAULT '1', \`isCurrent\` tinyint NOT NULL DEFAULT 1, \`rawSource\` json NOT NULL, \`activityId\` char(36) NOT NULL, \`resourceId\` char(36) NOT NULL, \`plannedUnits\` double NULL, \`actualUnits\` double NULL, \`plannedCost\` decimal(18,2) NULL, \`actualCost\` decimal(18,2) NULL, INDEX \`IDX_999a2b5b08356165af07d523c9\` (\`ingestionRunId\`), INDEX \`IDX_8a22e2ec17cd460e6fea2bb89b\` (\`sourceFileId\`), INDEX \`IDX_206b44144876e795094d44a61f\` (\`businessKey\`), INDEX \`IDX_91b9e9c4a28dcb13d86b8e95a0\` (\`isCurrent\`), INDEX \`IDX_01d3d4d8aac5f6fcaee1630bc0\` (\`activityId\`), INDEX \`IDX_6c8db5378075db148b427ec130\` (\`resourceId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`rule_evaluation\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`projectId\` char(36) NULL, \`status\` varchar(16) NOT NULL, \`startedAt\` datetime(6) NOT NULL, \`finishedAt\` datetime(6) NULL, \`alertCount\` int NOT NULL DEFAULT '0', \`summary\` json NOT NULL, INDEX \`IDX_6572b4272d0bcc8fb792d422ac\` (\`projectId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`source_file\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`filename\` varchar(512) NOT NULL, \`sourceType\` varchar(32) NOT NULL, \`contentSha256\` char(64) NOT NULL, \`byteSize\` int NOT NULL, \`storedPath\` varchar(1024) NOT NULL, INDEX \`IDX_365887ea62b8036501983a655e\` (\`contentSha256\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user\` (\`id\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`email\` varchar(320) NOT NULL, \`displayName\` varchar(255) NOT NULL, \`role\` varchar(32) NOT NULL, \`apiKeyHash\` char(64) NOT NULL, \`projectScopes\` varchar(1024) NOT NULL DEFAULT '*', \`active\` tinyint NOT NULL DEFAULT 1, UNIQUE INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` (\`email\`), INDEX \`IDX_6620cd026ee2b231beac7cfe57\` (\`role\`), UNIQUE INDEX \`IDX_dd64a292356555291de5d6635b\` (\`apiKeyHash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_dd64a292356555291de5d6635b\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_6620cd026ee2b231beac7cfe57\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` ON \`user\``);
        await queryRunner.query(`DROP TABLE \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_365887ea62b8036501983a655e\` ON \`source_file\``);
        await queryRunner.query(`DROP TABLE \`source_file\``);
        await queryRunner.query(`DROP INDEX \`IDX_6572b4272d0bcc8fb792d422ac\` ON \`rule_evaluation\``);
        await queryRunner.query(`DROP TABLE \`rule_evaluation\``);
        await queryRunner.query(`DROP INDEX \`IDX_6c8db5378075db148b427ec130\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_01d3d4d8aac5f6fcaee1630bc0\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_91b9e9c4a28dcb13d86b8e95a0\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_206b44144876e795094d44a61f\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_8a22e2ec17cd460e6fea2bb89b\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_999a2b5b08356165af07d523c9\` ON \`resource_assignment\``);
        await queryRunner.query(`DROP TABLE \`resource_assignment\``);
        await queryRunner.query(`DROP INDEX \`IDX_ba509a0a92e7d2778e75416e75\` ON \`resource\``);
        await queryRunner.query(`DROP INDEX \`IDX_4e88e4a4dbbbfd31edb32e9663\` ON \`resource\``);
        await queryRunner.query(`DROP INDEX \`IDX_00ed02c8f90d07f97d760c6676\` ON \`resource\``);
        await queryRunner.query(`DROP INDEX \`IDX_d755a60969466f3942a4fd0cb9\` ON \`resource\``);
        await queryRunner.query(`DROP INDEX \`IDX_e69f3bb83713786957aa7598e9\` ON \`resource\``);
        await queryRunner.query(`DROP TABLE \`resource\``);
        await queryRunner.query(`DROP INDEX \`IDX_3eba0feef825edc97946b47323\` ON \`report\``);
        await queryRunner.query(`DROP INDEX \`IDX_3f8b2cdc0dedeac8be8b850405\` ON \`report\``);
        await queryRunner.query(`DROP INDEX \`IDX_7f652745a10f2b65e68bcae0b4\` ON \`report\``);
        await queryRunner.query(`DROP INDEX \`IDX_af25da5598fe79db4f6005604d\` ON \`report\``);
        await queryRunner.query(`DROP INDEX \`IDX_1de0ab103b40fdf795bb343497\` ON \`report\``);
        await queryRunner.query(`DROP TABLE \`report\``);
        await queryRunner.query(`DROP INDEX \`IDX_cb06496b3a528dfcae8f483218\` ON \`project\``);
        await queryRunner.query(`DROP INDEX \`IDX_5483dd9be9478d0a94a3478899\` ON \`project\``);
        await queryRunner.query(`DROP INDEX \`IDX_4f8a7475a3c5505426e330d1c8\` ON \`project\``);
        await queryRunner.query(`DROP INDEX \`IDX_0f5c0cbccd0c094ba37e5e622d\` ON \`project\``);
        await queryRunner.query(`DROP TABLE \`project\``);
        await queryRunner.query(`DROP INDEX \`IDX_25bd46496fbe0a49dfd0f2e3a0\` ON \`ingestion_run\``);
        await queryRunner.query(`DROP TABLE \`ingestion_run\``);
        await queryRunner.query(`DROP INDEX \`IDX_fac3752be08cba1833e7c62c54\` ON \`governance_policy\``);
        await queryRunner.query(`DROP INDEX \`IDX_60d5736e628845dac3b4edd27c\` ON \`governance_policy\``);
        await queryRunner.query(`DROP TABLE \`governance_policy\``);
        await queryRunner.query(`DROP INDEX \`IDX_ae7e705493bce9c84d87544573\` ON \`governance_decision\``);
        await queryRunner.query(`DROP TABLE \`governance_decision\``);
        await queryRunner.query(`DROP INDEX \`IDX_673a9bb3d11880663c71f5f365\` ON \`executive_summary\``);
        await queryRunner.query(`DROP TABLE \`executive_summary\``);
        await queryRunner.query(`DROP INDEX \`IDX_d9cf33bf550dc599a635d68d18\` ON \`decision_review\``);
        await queryRunner.query(`DROP INDEX \`IDX_f637d88c63042280de73d3db98\` ON \`decision_review\``);
        await queryRunner.query(`DROP TABLE \`decision_review\``);
        await queryRunner.query(`DROP INDEX \`IDX_ca8020140b848ea57e5e207bc7\` ON \`confidence_score\``);
        await queryRunner.query(`DROP TABLE \`confidence_score\``);
        await queryRunner.query(`DROP INDEX \`IDX_c6b7ce8de0988641cd672bd6bc\` ON \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_24f7ba116929c80933072902de\` ON \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_ff07fbf7417010e3750f37041d\` ON \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_d97a302d6e27cb7ac9b935e692\` ON \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_b52a542544bc2b02efed8a008d\` ON \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_70267403c8591e1225af7e6fb0\` ON \`alert\``);
        await queryRunner.query(`DROP TABLE \`alert\``);
        await queryRunner.query(`DROP INDEX \`IDX_5a898f44fa31ef7916f0c38b01\` ON \`activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_e3909786113681f86ff50bf536\` ON \`activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_a34288f4929a34608f6a432d59\` ON \`activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_6d14e91e57a976a7fb272620c5\` ON \`activity\``);
        await queryRunner.query(`DROP INDEX \`IDX_8e73bf318eb4d2fd414dacb6a1\` ON \`activity\``);
        await queryRunner.query(`DROP TABLE \`activity\``);
    }

}
