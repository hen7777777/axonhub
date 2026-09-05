import { memo, useCallback } from 'react';
import { useFieldArray, useFormContext, useWatch, type Control, type FieldArrayPath, type FieldPath } from 'react-hook-form';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModelPriceEditor, type PriceEditorFormValues } from '@/components/model-price-editor';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const priceItemCodes = ['prompt_tokens', 'completion_tokens', 'prompt_cached_tokens', 'prompt_write_cached_tokens'] as const;
const promptWriteCacheVariantCodes = ['five_min', 'one_hour'] as const;

type PriceItem = PriceEditorFormValues['prices'][number]['price']['items'][number];
type RequestTier = NonNullable<PriceEditorFormValues['prices'][number]['price']['requestTotalTiered']>['tiers'][number];

function asFieldPath(path: string) {
  return path as unknown as FieldPath<PriceEditorFormValues>;
}

function asFieldArrayPath(path: string) {
  return path as unknown as FieldArrayPath<PriceEditorFormValues>;
}

export const RequestTotalTieredPriceEditor = memo(function RequestTotalTieredPriceEditor({
  control,
  priceIndex,
  currencyCode,
}: {
  control: Control<PriceEditorFormValues>;
  priceIndex: number;
  currencyCode?: string;
}) {
  const { t } = useTranslation();
  const { clearErrors, getValues, setValue } = useFormContext<PriceEditorFormValues>();
  const basePath = `prices.${priceIndex}.price.requestTotalTiered`;
  const pricing = useWatch({
    control,
    name: asFieldPath(basePath),
    compute: (value) => value,
  }) as unknown as PriceEditorFormValues['prices'][number]['price']['requestTotalTiered'];
  const tiers = pricing?.tiers || [];
  const { fields, insert, remove } = useFieldArray({
    control,
    name: asFieldArrayPath(`${basePath}.tiers`),
  });

  const setTierItems = useCallback(
    (tierIndex: number, items: PriceItem[]) => {
      setValue(asFieldPath(`${basePath}.tiers.${tierIndex}.items`), items as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [basePath, setValue]
  );

  const getTierItems = useCallback(
    (tierIndex: number) =>
      (getValues(asFieldPath(`${basePath}.tiers.${tierIndex}.items`)) as unknown as PriceItem[] | undefined) || [],
    [basePath, getValues]
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setValue(asFieldPath(basePath), null as never, { shouldDirty: true, shouldValidate: true });
        return;
      }

      const baseItems =
        (getValues(asFieldPath(`prices.${priceIndex}.price.items`)) as unknown as PriceItem[] | undefined) || [];
      const initialItems: PriceItem[] = baseItems.length
        ? structuredClone(baseItems)
        : [{ itemCode: 'prompt_tokens', pricing: { mode: 'usage_per_unit', usagePerUnit: '0' } }];

      setValue(
        asFieldPath(basePath),
        {
          tiers: [
            { upTo: 100_000, items: structuredClone(initialItems) },
            { upTo: null, items: structuredClone(initialItems) },
          ],
        } as never,
        { shouldDirty: true, shouldValidate: true }
      );
      setValue(asFieldPath(`prices.${priceIndex}.price.schedule`), null as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [basePath, getValues, priceIndex, setValue]
  );

  const handleAddTier = useCallback(() => {
    if (!tiers.length) return;
    const insertionIndex = tiers.length - 1;
    const previousUpTo = insertionIndex > 0 ? tiers[insertionIndex - 1]?.upTo : null;
    const nextUpTo = typeof previousUpTo === 'number' ? previousUpTo * 2 : 100_000;
    insert(insertionIndex, {
      upTo: nextUpTo,
      items: structuredClone(tiers[insertionIndex]?.items || tiers[insertionIndex - 1]?.items || []),
    } as RequestTier);
  }, [insert, tiers]);

  const handleRemoveTier = useCallback(
    (tierIndex: number) => {
      if (tiers.length <= 1) return;
      if (tierIndex === tiers.length - 1) {
        setValue(asFieldPath(`${basePath}.tiers.${tierIndex - 1}.upTo`), null as never, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      remove(tierIndex);
    },
    [basePath, remove, setValue, tiers.length]
  );

  const addItem = useCallback(
    (tierIndex: number) => {
      const currentItems = getTierItems(tierIndex);
      const existingCodes = new Set(currentItems.map((item) => item.itemCode));
      const nextCode = priceItemCodes.find((code) => !existingCodes.has(code));
      if (!nextCode) return;
      setTierItems(tierIndex, [
        ...currentItems,
        { itemCode: nextCode, pricing: { mode: 'usage_per_unit', usagePerUnit: '0' } },
      ]);
    },
    [getTierItems, setTierItems]
  );

  const removeItem = useCallback(
    (tierIndex: number, itemIndex: number) => {
      const currentItems = getTierItems(tierIndex);
      if (currentItems.length <= 1) return;
      currentItems.forEach((_, index) => clearErrors(asFieldPath(`${basePath}.tiers.${tierIndex}.items.${index}.itemCode`)));
      setTierItems(
        tierIndex,
        currentItems.filter((_, index) => index !== itemIndex)
      );
    },
    [basePath, clearErrors, getTierItems, setTierItems]
  );

  const addVariant = useCallback(
    (tierIndex: number, itemIndex: number) => {
      const items = getTierItems(tierIndex);
      const variants = items[itemIndex]?.promptWriteCacheVariants || [];
      const existingCodes = new Set(variants.map((variant) => variant.variantCode));
      const nextCode = promptWriteCacheVariantCodes.find((code) => !existingCodes.has(code));
      if (!nextCode || !items[itemIndex]) return;
      const nextItems = structuredClone(items);
      nextItems[itemIndex].promptWriteCacheVariants = [
        ...variants,
        { variantCode: nextCode, pricing: { mode: 'usage_per_unit', usagePerUnit: '0' } },
      ];
      setTierItems(tierIndex, nextItems);
    },
    [getTierItems, setTierItems]
  );

  const removeVariant = useCallback(
    (tierIndex: number, itemIndex: number, variantIndex: number) => {
      const items = getTierItems(tierIndex);
      const variants = items[itemIndex]?.promptWriteCacheVariants || [];
      if (!items[itemIndex]) return;
      const nextItems = structuredClone(items);
      nextItems[itemIndex].promptWriteCacheVariants = variants.filter((_, index) => index !== variantIndex);
      setTierItems(tierIndex, nextItems);
    },
    [getTierItems, setTierItems]
  );

  const isEnabled = pricing != null;

  return (
    <div className='mt-3 space-y-3'>
      <div className='flex items-center gap-2'>
        <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        <Layers size={14} className={isEnabled ? 'text-primary' : 'text-muted-foreground'} />
        <span className='text-muted-foreground text-sm'>{t('price.requestTotalTiered.title')}</span>
      </div>

      {isEnabled && (
        <div className='space-y-4 rounded-md border border-dashed p-4'>
          <div className='flex justify-end'>
            <Button type='button' variant='outline' size='icon-sm' onClick={handleAddTier} title={t('price.requestTotalTiered.addTier')}>
              <Plus size={14} />
            </Button>
          </div>

          {fields.map((field, tierIndex) => {
            const isLastTier = tierIndex === fields.length - 1;
            const itemsPath = `${basePath}.tiers.${tierIndex}.items`;
            return (
              <section key={field.id} className='min-w-0 space-y-3 border-t pt-4 first:border-t-0 first:pt-0'>
                <div className='flex items-start gap-2'>
                  <FormField
                    control={control}
                    name={asFieldPath(`${basePath}.tiers.${tierIndex}.upTo`)}
                    render={({ field }) => (
                      <FormItem className='min-w-0 flex-1'>
                        <FormLabel className='text-xs'>{t('price.requestTotalTiered.upTo')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={1}
                            max={Number.MAX_SAFE_INTEGER}
                            step={1}
                            {...field}
                            value={isLastTier ? '' : (field.value as unknown as number | null | undefined) ?? ''}
                            onChange={(event) =>
                              isLastTier ? field.onChange(null) : field.onChange(event.target.value ? Number(event.target.value) : null)
                            }
                            placeholder={isLastTier ? t('price.requestTotalTiered.unlimited') : '100000'}
                            disabled={isLastTier}
                            className='h-8'
                          />
                        </FormControl>
                        <FormMessage className='text-[10px]' />
                      </FormItem>
                    )}
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    className='text-destructive mt-5'
                    disabled={fields.length <= 1}
                    onClick={() => handleRemoveTier(tierIndex)}
                    title={t('price.requestTotalTiered.removeTier')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>

                <ModelPriceEditor
                  control={control}
                  priceIndex={priceIndex}
                  itemsPath={itemsPath}
                  currencyCode={currencyCode}
                  hideHeader
                  onAddItem={() => addItem(tierIndex)}
                  onRemoveItem={(_ignored, itemIndex) => removeItem(tierIndex, itemIndex)}
                  onAddVariant={(_ignored, itemIndex) => addVariant(tierIndex, itemIndex)}
                  onRemoveVariant={(_ignored, itemIndex, variantIndex) => removeVariant(tierIndex, itemIndex, variantIndex)}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
});
