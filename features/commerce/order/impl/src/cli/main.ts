import { CommandFactory } from 'nest-commander';
import { CliModule } from './cli.module';

async function bootstrap() {
  await CommandFactory.run(CliModule, {
    logger: ['log', 'warn', 'error'],
    errorHandler: (err: any) => {
      if (
        err.code?.startsWith('commander.help') ||
        err.code === 'commander.version'
      ) {
        process.exit(err.exitCode ?? 0);
      }
      console.error(err);
      process.exit(err.exitCode ?? 1);
    },
  });
}
void bootstrap();
