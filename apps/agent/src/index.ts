#!/usr/bin/env node
import { program } from 'commander'
import { loginCommand } from './commands/login'
import { registerCommand } from './commands/register'
import { connectCommand } from './commands/connect'
import { statusCommand } from './commands/status'
import { daemonCommand } from './commands/daemon'
import { keyCommand } from './commands/key'

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
  .option('-u, --url <url>', 'Backend API URL (e.g. http://localhost:3001 or https://codeaway-backend-fp72.onrender.com)')
  .action(connectCommand)

program
  .command('status')
  .description('Show current connection and config status')
  .action(statusCommand)

program
  .command('daemon <action>')
  .description('Manage Mac background service (install, uninstall, start, stop, status, logs)')
  .option('-w, --workspace <path>', 'Workspace directory to monitor')
  .option('-n, --lines <number>', 'Number of log lines to show (default 30)')
  .action(daemonCommand)

program
  .command('key <action> [provider] [key]')
  .description('Manage AI provider keys (set, list)')
  .action(keyCommand)

program.parse()
