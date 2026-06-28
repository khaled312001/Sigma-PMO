import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { GovernanceModule } from '../governance/governance.module';
import { ValidationModule } from '../validation/validation.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { NormalizerService } from './normalizer/normalizer.service';
import { CsvParser } from './parsers/csv.parser';
import { ExcelParser } from './parsers/excel.parser';
import { MSProjectXmlParser } from './parsers/msproject-xml.parser';
import { P6ApiParser } from './parsers/p6-api.parser';
import { P6PdfParser } from './parsers/p6-pdf.parser';
import { P6XerParser } from './parsers/p6-xer.parser';
import { P6XmlParser } from './parsers/p6-xml.parser';
import { ParserRegistry } from './parsers/parser.registry';
import { StorageService } from './storage/storage.service';
import { TemplateService } from './template.service';

@Module({
  imports: [CanonicalModule, ValidationModule, GovernanceModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    TemplateService,
    NormalizerService,
    StorageService,
    ParserRegistry,
    P6XerParser,
    P6XmlParser,
    MSProjectXmlParser,
    ExcelParser,
    CsvParser,
    P6PdfParser,
    P6ApiParser,
  ],
  exports: [IngestionService, StorageService],
})
export class IngestionModule {}
