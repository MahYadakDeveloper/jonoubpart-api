import { Command, CommandRunner } from 'nest-commander';
import { SeedLocationsCommand } from './seed-locations.command';

@Command({
  name: 'seed',
  description: 'Seed reference data',
  subCommands: [SeedLocationsCommand],
})
export class SeedCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
