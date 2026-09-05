import type { PriceEditorItem } from '@/components/model-price-editor';

type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

function parseDecimal(value: string): ParsedDecimal | null {
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) return null;

  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;

  const fraction = match[3] || '';
  const digits = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
  let coefficient = BigInt(digits);
  if (match[1] === '-') coefficient = -coefficient;

  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return { coefficient, scale };
}

function formatDecimal({ coefficient, scale }: ParsedDecimal): string {
  if (coefficient === 0n) return '0';

  const sign = coefficient < 0n ? '-' : '';
  let digits = (coefficient < 0n ? -coefficient : coefficient).toString();
  if (scale === 0) return `${sign}${digits}`;

  digits = digits.padStart(scale + 1, '0');
  const integer = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`;
}

function multiplyDecimal(value: string | null | undefined, multiplier: string): string | null | undefined {
  if (value == null || value.trim() === '') return value;

  const price = parseDecimal(value);
  const factor = parseDecimal(multiplier);
  if (!price || !factor) return value;

  return formatDecimal({
    coefficient: price.coefficient * factor.coefficient,
    scale: price.scale + factor.scale,
  });
}

function multiplyPricing(pricing: PriceEditorItem['pricing'], multiplier: string): PriceEditorItem['pricing'] {
  return {
    ...pricing,
    flatFee: multiplyDecimal(pricing.flatFee, multiplier),
    usagePerUnit: multiplyDecimal(pricing.usagePerUnit, multiplier),
    usageTiered: pricing.usageTiered
      ? {
          ...pricing.usageTiered,
          tiers: pricing.usageTiered.tiers.map((tier) => ({
            ...tier,
            pricePerUnit: multiplyDecimal(tier.pricePerUnit, multiplier) || tier.pricePerUnit,
          })),
        }
      : pricing.usageTiered,
  };
}

export function isPositivePriceMultiplier(value: string): boolean {
  const parsed = parseDecimal(value);
  return parsed != null && parsed.coefficient > 0n;
}

export function hasRequestTotalTiers(pricing: { tiers?: unknown[] } | null | undefined): boolean {
  return Array.isArray(pricing?.tiers) && pricing.tiers.length > 0;
}

export function multiplyPriceItems(items: PriceEditorItem[], multiplier: string): PriceEditorItem[] {
  return items.map((item) => ({
    ...item,
    pricing: multiplyPricing(item.pricing, multiplier),
    promptWriteCacheVariants: item.promptWriteCacheVariants?.map((variant) => ({
      ...variant,
      pricing: multiplyPricing(variant.pricing, multiplier),
    })) ?? item.promptWriteCacheVariants,
  }));
}
