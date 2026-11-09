import { BrandDto } from '@feature/catalog-brand-api';
import { LineItems } from '@feature/shared';
import { FitmentDto } from '../../../fitment/api/dist/fitment.dto';
import { SearchTextBuilder } from './string-text-builder';

export function generateSearchText({
  canonicalName,
  aliases,
  fitments,
  brand,
}: {
  canonicalName: string;
  aliases: string[];
  brand?: BrandDto | null;
  fitments: LineItems<FitmentDto>;
}): string {
  const fitmentText = fitments
    .toArray()
    .flatMap((fitment) => [
      fitment.model.name,
      fitment.series,
      fitment.transmission,
      fitment.fuelType,
    ]);

  // [TODO] Add Persian text normalizer like lowercasing, english digits, arabic to persian and etc.
  return new SearchTextBuilder()
    .add(canonicalName)
    .add(aliases)
    .add(brand?.name)
    .add(brand?.slug)
    .add(...fitmentText)
    .build();
}
