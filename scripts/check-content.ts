// Lists every remaining [EDIT] placeholder with file and line, every empty
// media frame, and evidence warnings.
//
//   npm run check-content              report only, always exits 0
//   npm run check-content -- --strict  exits 1 while placeholders or empty frames remain,
//                                      unless ALLOW_PLACEHOLDERS=1 (preview deploys)
import { audit, formatAudit, isBlocking } from './content-audit.ts';

const result = audit(process.cwd());
console.log(formatAudit(result));

const strict = process.argv.includes('--strict');
if (strict && isBlocking(result)) {
  if (process.env.ALLOW_PLACEHOLDERS === '1') {
    console.warn('\nALLOW_PLACEHOLDERS=1: placeholders allowed for this preview build.');
  } else {
    console.error('\nProduction build blocked: replace every [EDIT] and fill every empty frame.');
    process.exit(1);
  }
}
