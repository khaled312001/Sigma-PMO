/**
 * No-database verification of the ingestion pipeline (parse + validate) against
 * the generated sample files. Proves the Cycle 1 acceptance at the dataset
 * level — "ingest sample P6 + Excel and verify normalised state" — without
 * requiring a live MySQL instance. Exits non-zero if any self-contained source
 * (P6 XER, P6 XML, Excel) has validation errors.
 *
 * Run:  npm run verify:samples
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CsvParser } from '../src/modules/ingestion/parsers/csv.parser';
import { ExcelParser } from '../src/modules/ingestion/parsers/excel.parser';
import { MSProjectXmlParser } from '../src/modules/ingestion/parsers/msproject-xml.parser';
import { P6XerParser } from '../src/modules/ingestion/parsers/p6-xer.parser';
import { P6XmlParser } from '../src/modules/ingestion/parsers/p6-xml.parser';
import { ParserRegistry } from '../src/modules/ingestion/parsers/parser.registry';
import { RawDataset } from '../src/modules/ingestion/parsers/parser.interface';
import { ValidationService } from '../src/modules/validation/validation.service';

/* eslint-disable no-console */

const SAMPLES_DIR = resolve(__dirname, '..', '..', 'data', 'samples');

interface Check {
  file: string;
  /** Self-contained sources must validate with zero errors. */
  strict: boolean;
}

const CHECKS: Check[] = [
  { file: 'p6_schedule.xer', strict: true },
  { file: 'p6_schedule.xml', strict: true },
  { file: 'schedule.xlsx', strict: true },
  { file: 'projects.csv', strict: false },
  { file: 'activities.csv', strict: false },
  { file: 'report_weekly.csv', strict: false },
];

function counts(ds: RawDataset): string {
  return `proj=${ds.projects.length} act=${ds.activities.length} res=${ds.resources.length} rep=${ds.reports.length} asg=${ds.assignments.length}`;
}

async function main(): Promise<void> {
  const registry = new ParserRegistry(
    new P6XerParser(),
    new P6XmlParser(),
    new MSProjectXmlParser(),
    new ExcelParser(),
    new CsvParser(),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    new (require('../src/modules/ingestion/parsers/p6-pdf.parser').P6PdfParser)(),
  );
  const validator = new ValidationService();
  let failures = 0;

  console.log(`Verifying samples in ${SAMPLES_DIR}\n`);

  for (const check of CHECKS) {
    const buffer = readFileSync(join(SAMPLES_DIR, check.file));
    const parser = registry.resolve(check.file, buffer);
    const dataset = await Promise.resolve(parser.parse(check.file, buffer));
    const report = validator.validate(dataset);
    const status = report.passed ? 'PASS' : 'FAIL';

    console.log(
      `[${status}] ${check.file.padEnd(20)} via ${parser.name.padEnd(7)} ${counts(dataset)}  ` +
        `errors=${report.errorCount} warnings=${report.warningCount}`,
    );
    for (const issue of report.issues.filter((i) => i.severity === 'error')) {
      console.log(`         ERROR ${issue.entity}/${issue.businessKey ?? '?'} [${issue.code}] ${issue.message}`);
    }
    if (check.strict && !report.passed) failures += 1;
  }

  console.log('');
  if (failures > 0) {
    console.error(`Verification FAILED: ${failures} self-contained source(s) had validation errors.`);
    process.exitCode = 1;
  } else {
    console.log('Verification PASSED: P6 (XER + XML) and Excel parse, validate, and are ready to normalise.');
  }
}

void main();
