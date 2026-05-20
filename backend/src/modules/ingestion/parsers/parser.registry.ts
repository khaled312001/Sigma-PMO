import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';

import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { P6XerParser } from './p6-xer.parser';
import { P6XmlParser } from './p6-xml.parser';
import { SourceParser } from './parser.interface';

/**
 * Selects the correct parser for a given file. Parsers are tried in order; the
 * first whose `supports()` returns true wins. P6 XML is checked before generic
 * detection because it shares the `.xml` extension with other XML.
 */
@Injectable()
export class ParserRegistry {
  private readonly parsers: SourceParser[];

  constructor(
    p6Xer: P6XerParser,
    p6Xml: P6XmlParser,
    excel: ExcelParser,
    csv: CsvParser,
  ) {
    this.parsers = [p6Xer, p6Xml, excel, csv];
  }

  resolve(filename: string, buffer: Buffer): SourceParser {
    const parser = this.parsers.find((p) => p.supports(filename, buffer));
    if (!parser) {
      throw new UnsupportedMediaTypeException(
        `No parser supports file "${filename}". Supported: .xer, .xml (PMXML), .xlsx, .csv`,
      );
    }
    return parser;
  }

  all(): SourceParser[] {
    return [...this.parsers];
  }
}
