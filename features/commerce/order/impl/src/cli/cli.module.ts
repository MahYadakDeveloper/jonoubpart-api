import { DrizzleDbModule } from '@infra/db-drizzle';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { LocationsSeeder } from './seed/locations.seeder';
import { SeedLocationsCommand } from './seed/seed-locations.command';
import { SeedCommand } from './seed/seed.command';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../../.env'),
    }),
    DrizzleDbModule,
  ],
  providers: [SeedCommand, SeedLocationsCommand, LocationsSeeder],
})
export class CliModule {}
