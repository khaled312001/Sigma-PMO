import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ValidationModule } from '../validation/validation.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { NormalizerService } from './normalizer/normalizer.service';
import { CsvParser } from './parsers/csv.parser';
import { ExcelParser } from './parsers/excel.parser';
import { P6XerParser } from './parsers/p6-xer.parser';
import { P6XmlParser } from './parsers/p6-xml.parser';
import { ParserRegistry } from './parsers/parser.registry';
import { StorageService } from './storage/storage.service';

@Module({
  imports: [CanonicalModule, ValidationModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    NormalizerService,
    StorageService,
    ParserRegistry,
    P6XerParser,
    P6XmlParser,
    ExcelParser,
    CsvParser,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
