import type { Purchase } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../app/services';
import { Select } from '../../../ui/Select';
import { CommitField } from '../parts';

/**
 * 1.9 price of a part (RAM module, disk, GPU, add-in card): owned / to buy / optional and a price
 * per piece in the project currency — counted in the bill of materials and the variant comparison.
 */
export function PartPurchase({
  value,
  onChange,
}: {
  value: Purchase | undefined;
  onChange: (purchase: Purchase | undefined) => void;
}) {
  const { t } = useTranslation('inspector');
  const currency = useSession((s) => s.project?.settings.currency) ?? '';
  const set = (changes: Partial<Purchase>) => {
    const next: Purchase = { status: 'owned', ...value, ...changes };
    if (next.price === undefined) {
      delete next.price;
      delete next.currency;
    }
    onChange(next.status === 'owned' && next.price === undefined ? undefined : next);
  };
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Select
        label={t('hardware.purchaseStatus')}
        value={value?.status ?? 'owned'}
        options={(['owned', 'to-buy', 'optional'] as const).map((s) => ({
          value: s,
          label: t(`hardware.purchaseStatuses.${s}`),
        }))}
        onChange={(e) => set({ status: e.target.value as Purchase['status'] })}
      />
      <CommitField
        label={t('hardware.partPrice', { currency: value?.currency ?? currency })}
        mono
        value={value?.price !== undefined ? String(value.price) : ''}
        validate={(v) =>
          v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0) ? null : t('errors.number')
        }
        onCommit={(v) =>
          set(
            v === ''
              ? { price: undefined }
              : { price: Number(v), currency: value?.currency ?? currency },
          )
        }
      />
    </div>
  );
}
