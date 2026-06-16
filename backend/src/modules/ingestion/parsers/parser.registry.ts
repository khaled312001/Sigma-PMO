import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';

import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { MSProjectXmlParser } from './msproject-xml.parser';
import { P6ApiParser } from './p6-api.parser';
import { P6PdfParser } from './p6-pdf.parser';
import { P6XerParser } from './p6-xer.parser';
import { P6XmlParser } from './p6-xml.parser';
import { SourceParser } from './parser.interface';

/**
 * Selects the correct parser for a given file. Parsers are tried in order; the
 * first whose `supports()` returns true wins. For `.xml`, both P6 PMXML and
 * MS Project use the same extension — each parser sniffs the schema marker
 * in the first 4 KB to disambiguate.
 */
@Injectable()
export class ParserRegistry {
  private readonly parsers: SourceParser[];

  constructor(
    p6Xer: P6XerParser,
    p6Xml: P6XmlParser,
    msproject: MSProjectXmlParser,
    excel: ExcelParser,
    csv: CsvParser,
    p6Pdf: P6PdfParser,
    p6Api: P6ApiParser,
  ) {
    // p6Api first — its `.p6json` / "p6-eppm-rest" marker is unambiguous and
    // never collides with the file formats below.
    this.parsers = [p6Api, p6Xer, p6Xml, msproject, excel, csv, p6Pdf];
  }

  resolve(filename: string, buffer: Buffer): SourceParser {
    const parser = this.parsers.find((p) => p.supports(filename, buffer));
    if (!parser) {
      throw new UnsupportedMediaTypeException(
        `No parser supports file "${filename}". Supported: .xer, .xml (PMXML or MS Project), .xlsx, .csv, .pdf (P6 export)`,
      );
    }
    return parser;
  }

  all(): SourceParser[] {
    return [...this.parsers];
  }
}
