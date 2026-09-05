import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(join(import.meta.dirname, 'request-total-tiered-price.ts'), 'utf8');
const editorSource = readFileSync(join(import.meta.dirname, 'request-total-tiered-price-editor.tsx'), 'utf8');
const dialogSource = readFileSync(
  join(import.meta.dirname, '..', 'features', 'channels', 'components', 'channels-model-price-dialog.tsx'),
  'utf8'
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
const { hasRequestTotalTiers, isPositivePriceMultiplier, multiplyPriceItems } = await import(moduleUrl);

test('disabled request-total pricing is not materialized or serialized as tiers', () => {
  assert.equal(hasRequestTotalTiers(null), false);
  assert.equal(hasRequestTotalTiers(undefined), false);
  assert.equal(hasRequestTotalTiers({ tiers: [] }), false);
  assert.equal(hasRequestTotalTiers({ tiers: [{ upTo: null, items: [] }] }), true);

  const outerEditorStart = editorSource.indexOf('export const RequestTotalTieredPriceEditor');
  const tierFieldsStart = editorSource.indexOf('function RequestTotalTierFields');
  assert.ok(outerEditorStart >= 0 && tierFieldsStart > outerEditorStart);
  const outerEditorSource = editorSource.slice(outerEditorStart, tierFieldsStart);
  assert.doesNotMatch(
    outerEditorSource,
    /useFieldArray\s*\(/,
    'the always-mounted switch must not register the optional nested tiers array'
  );
  assert.match(
    outerEditorSource,
    /isEnabled\s*&&\s*\([\s\S]*<RequestTotalTierFields/,
    'the nested tiers array should mount only after request-total pricing is enabled'
  );
  assert.match(
    dialogSource,
    /requestTotalTiered:\s*hasRequestTotalTiers\(p\.price\.requestTotalTiered\)/,
    'save payloads must serialize only explicitly populated request-total tiers'
  );
});

test('request tier price multiplier accepts configurable positive decimal values', () => {
  assert.equal(isPositivePriceMultiplier('2'), true);
  assert.equal(isPositivePriceMultiplier('1.5'), true);
  assert.equal(isPositivePriceMultiplier('0'), false);
  assert.equal(isPositivePriceMultiplier('-2'), false);
  assert.equal(isPositivePriceMultiplier('not-a-number'), false);
});

test('request tier price multiplier fills every corresponding price exactly', () => {
  const sourceItems = [
    {
      itemCode: 'prompt_tokens',
      pricing: {
        mode: 'usage_tiered',
        flatFee: '0.1',
        usagePerUnit: '0.000001',
        usageTiered: {
          tiers: [
            { upTo: 1000, pricePerUnit: '1.25' },
            { upTo: null, pricePerUnit: '2.5' },
          ],
        },
      },
      promptWriteCacheVariants: [
        {
          variantCode: 'five_min',
          pricing: { mode: 'usage_per_unit', usagePerUnit: '0.333' },
        },
      ],
    },
  ];

  const multiplied = multiplyPriceItems(sourceItems, '1.5');

  assert.equal(multiplied[0].pricing.flatFee, '0.15');
  assert.equal(multiplied[0].pricing.usagePerUnit, '0.0000015');
  assert.deepEqual(multiplied[0].pricing.usageTiered.tiers, [
    { upTo: 1000, pricePerUnit: '1.875' },
    { upTo: null, pricePerUnit: '3.75' },
  ]);
  assert.equal(multiplied[0].promptWriteCacheVariants[0].pricing.usagePerUnit, '0.4995');
  assert.equal(sourceItems[0].pricing.flatFee, '0.1');
});

test('request tier price multiplier preserves empty and invalid draft values', () => {
  const multiplied = multiplyPriceItems(
    [
      {
        itemCode: 'completion_tokens',
        pricing: { mode: 'usage_per_unit', flatFee: null, usagePerUnit: 'draft' },
      },
    ],
    '2'
  );

  assert.equal(multiplied[0].pricing.flatFee, null);
  assert.equal(multiplied[0].pricing.usagePerUnit, 'draft');
});
