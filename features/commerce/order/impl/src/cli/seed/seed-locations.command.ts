// seed/seed-locations.command.ts
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { readFile } from 'node:fs/promises';
import { LocationsSeeder } from './locations.seeder';

@SubCommand({ name: 'locations', description: 'Upsert provinces and cities' })
export class SeedLocationsCommand extends CommandRunner {
  constructor(private readonly seeder: LocationsSeeder) {
    super();
  }

  async run(_params: string[], options?: { file?: string }): Promise<void> {
    if (!options?.file) {
      throw new Error('Missing required option: --file <path>');
    }

    let data: unknown;
    try {
      data = JSON.parse(await readFile(options.file, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot read locations file "${options.file}"`, {
        cause: error,
      });
    }

    await this.seeder.seed(data);
  }

  @Option({ flags: '-f, --file <path>', description: 'Path to locations.json' })
  parseFile(value: string): string {
    return value;
  }
}
