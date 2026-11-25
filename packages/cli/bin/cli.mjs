#!/usr/bin/env node

import process from 'node:process';

import { LogLevel } from '@doc-kit/core/logger/constants.mjs';
import logger from '@doc-kit/core/logger/index.mjs';
import { Command, Option } from 'commander';

import createProgressBar from '../src/utils/progress-bar.mjs';
import createCommands from './commands/index.mjs';

const program = new Command()
  .name('doc-kit')
  .description('CLI tool to generate the Node.js API documentation')
  .addOption(
    new Option('--log-level <level>', 'Log level')
      .default('info')
      .choices(Object.keys(LogLevel))
  )
  .hook('preAction', cmd => logger.setLogLevel(cmd.opts().logLevel));

// Only animate at the default log level, keeping debug traces readable.
const progress = createProgressBar({
  enabled: () => logger.getLogLevel() === LogLevel.info,
});

// Registering commands
createCommands(progress).forEach(command => program.addCommand(command));

// Parse and execute command-line arguments
program.parse(process.argv);
