#!/usr/bin/env node
import { program } from 'commander'
import { loginCommand } from './commands/login'
import { registerCommand } from './commands/register'
import { connectCommand } from './commands/connect'
import { statusCommand } from './commands/status'

program
  .name('codeaway')
  .description('CodeAway laptop agent — delegate coding tasks from your phone')
  .version('0.1.0')

program
  .command('register')
  .description('Register a new account on CodeAway backend')
  .action(registerCommand)

program
  .command('login')
  .description('Authenticate with the CodeAway backend')
  .action(loginCommand)

program
  .command('connect')
  .description('Register this laptop and start listening for tasks')
  .option('-w, --workspace <path>', 'Path to the allowed workspace folder')
  .action(connectCommand)

program
  .command('status')
  .description('Show current connection and config status')
  .action(statusCommand)

program.parse()
