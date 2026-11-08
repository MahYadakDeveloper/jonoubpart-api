import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import { actorsRelations, addresses } from '@infra/db-drizzle/schema';
import { AsyncLocalStorage } from 'async_hooks';
import { and, DBQueryConfigColumns, eq } from 'drizzle-orm';
import { AddressDto } from './address.service';

export type Address = Omit<typeof addresses.$inferSelect, 'customerId'>;

const columns = {
  customerId: false,
} satisfies DBQueryConfigColumns<typeof addresses._.columns>;

export class AddressRepository extends DrizzleBaseRepository<
  typeof actorsRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof actorsRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  findManyByCustomerId(customerId: string): Promise<AddressDto[]> {
    return this.db.query.addresses
      .findMany({
        where: {
          customerId,
        },
        columns,
      })
      .then((a) => a.map(toDto));
  }

  findByIdAndCustomerId(
    id: string,
    customerId: string,
  ): Promise<AddressDto | null> {
    return this.db.query.addresses
      .findFirst({
        where: {
          id,
          customerId,
        },
        columns,
      })
      .then((a) => (a ? toDto(a) : null));
  }

  async create(customerId: string, dto: AddressDto): Promise<void> {
    await this.db.insert(addresses).values(toInsert(customerId, dto));
  }

  async updateByCustomerIdAndId(
    customerId: string,
    addressId: string,
    data: Omit<typeof addresses.$inferInsert, 'customerId'>,
  ): Promise<void> {
    await this.db
      .update(addresses)
      .set(data)
      .where(
        and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)),
      );
  }

  async deleteByCustomerIdAndId(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    await this.db
      .delete(addresses)
      .where(
        and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)),
      );
  }
}

function toDto(a: Address): AddressDto {
  const base = { id: a.id, address: a.address, cityId: a.cityId };

  if (a.scope === 'intra_city') {
    return {
      ...base,
      scope: a.scope,
      ...(a.latitude != null &&
        a.longitude != null && {
          coordinate: { latitude: a.latitude, longitude: a.longitude },
        }),
    };
  }

  return {
    ...base,
    scope: a.scope,
    provinceId: a.provinceId!,
    postalCode: a.postalCode!,
  };
}

function toInsert(
  customerId: string,
  dto: AddressDto,
): typeof addresses.$inferInsert {
  if (dto.scope === 'intra_city') {
    const { coordinate, ...rest } = dto;
    return {
      ...rest,
      customerId,
      latitude: coordinate?.latitude,
      longitude: coordinate?.longitude,
    };
  }
  return { ...dto, customerId };
}
