import { Query } from '@feature/shared/cqrs';
import '@feature/shared/extensions';
import { orderBy, sortableFields } from '@feature/shared/pagination';
import { StrictOmit } from '@feature/shared/types/utils';
import { assertNotNull } from '@feature/shared/utils/assertions';
import { omit } from '@feature/shared/utils/common';
import { type Database, DbErrors, InjectDrizzle } from '@infra/db-drizzle';
import {
  movementItems,
  movements,
} from '@infra/schema/warehouse/movements.schema';
import { eq, getColumns } from 'drizzle-orm';
import { ListQueryDto } from '../dto/list-query.dto';

export const movementSortableFields = sortableFields(movements);

type MovementSource = (typeof movements.source.enumValues)[number];
type MovementSelect = typeof movements.$inferSelect;

const SOURCE_REFERENCE = {
  order: 'orderId',
  sale: 'saleId',
  procurement: 'procurementId',
  adjustment: 'adjustmentId',
} as const satisfies Record<MovementSource, keyof MovementSelect>;

type SourceReference = typeof SOURCE_REFERENCE;
type ReferenceKey = SourceReference[MovementSource];
type MovementItemView = StrictOmit<
  typeof movementItems.$inferSelect,
  'movementId'
>;
export type MovementView = {
  [S in MovementSource]: StrictOmit<MovementSelect, ReferenceKey | 'source'> & {
    source: S;
    items: MovementItemView[];
  } & Record<SourceReference[S], string>;
}[MovementSource];

@DbErrors({
  constraints: {
    // Example of error mapping
  },
})
export class ListQuery implements Query<ListQueryDto, unknown> {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  execute({ page, size, sort }: ListQueryDto) {
    const paginated = this.db
      .select()
      .from(movements)
      .offset((page - 1) * size)
      .orderBy(...orderBy(movements, sort))
      .limit(size)
      .as('paginated');

    const { movementId: _mId, ...movementItemView } = getColumns(movementItems);
    const movementView = {
      ...getColumns(paginated),
      item: movementItemView,
    };
    return this.db
      .select(movementView)
      .from(paginated)
      .leftJoin(movementItems, eq(movementItems.movementId, paginated.id))
      .then((rows) =>
        [...Map.groupBy(rows, (r) => r.id).values()].map((group) => {
          const { item: _i, ...m } = group[0]!;
          const refKey = SOURCE_REFERENCE[m.source];
          const refVal = m[refKey];
          assertNotNull(refVal, Error);
          return {
            ...omit(m, Object.values(SOURCE_REFERENCE)),
            [refKey]: refVal,
            items: group.flatMap((r) => (r.item ? [r.item] : [])),
          } as MovementView;
        }),
      );
  }
}
