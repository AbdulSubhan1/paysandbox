import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { expect } from 'vitest';
import { parse } from 'yaml';

const spec = parse(readFileSync(path.join(process.cwd(), '..', '..', 'openapi.yaml'), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'openapi', components: spec.components });

/** Fails the test when a response body does not match `components.schemas.<name>` in openapi.yaml. */
export function expectMatchesSchema(name: string, body: unknown): void {
  const validate = ajv.getSchema(`openapi#/components/schemas/${name}`);
  if (!validate) throw new Error(`No schema named ${name} in openapi.yaml`);
  const ok = validate(body);
  expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
}
