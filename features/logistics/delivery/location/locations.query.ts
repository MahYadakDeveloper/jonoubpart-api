import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import { orderRelations } from '@infra/db-drizzle/schema';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class LocationsQuery extends DrizzleBaseRepository<
  typeof orderRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof orderRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  async findProvinceById(provinceId: number) {
    const province = await this.db.query.provinces.findFirst({
      where: {
        id: provinceId,
      },
      with: {
        cities: true,
      },
    });

    if (!province)
      throw new NotFoundException(`Province not found: ${provinceId}`);

    return province;
  }

  async findCityById(cityId: number) {
    const city = await this.db.query.cities.findFirst({
      where: {
        id: cityId,
      },
      with: {
        province: true,
      },
    });

    if (!city) throw new NotFoundException(`City not found: ${cityId}`);

    return city;
  }

  async listCitiesByProvinceId(provinceId: number) {
    return this.db.query.cities.findMany({
      orderBy: { id: 'asc' },
      where: {
        provinceId,
      },
      with: {
        province: false,
      },
    });
  }

  async listProvinces() {
    return this.db.query.provinces.findMany({
      orderBy: { id: 'asc' },
      with: { cities: true },
    });
  }
}
