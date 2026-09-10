import chalk from 'chalk'
import {
  installDaemon,
  uninstallDaemon,
  startDaemon,
  stopDaemon,
  getDaemonStatus,
  readDaemonLogs,
  getDaemonPaths,
} from '../core/daemon'
import { getConfig } from '../core/config'

export function daemonCommand(action: string, opts: { workspace?: string; lines?: string }) {
  const config = getConfig()
  const paths = getDaemonPaths()

  switch (action) {
    case 'install': {
      const ws = opts.workspace || config.workspace || process.cwd()
      try {
        installDaemon(ws)
        console.log(chalk.green('✅ CodeAway background daemon installed successfully!'))
        console.log(chalk.dim(`   Plist file : ${paths.plist}`))
        console.log(chalk.dim(`   Workspace  : ${ws}`))
        console.log(chalk.dim(`   Stdout log : ${paths.stdout}`))
        console.log(chalk.cyan('\n🚀 Agent is now running silently in the background on your Mac.'))
        console.log(chalk.cyan('   It will automatically launch when you restart or log into your Mac.'))
        console.log(chalk.dim('   To check status: codeaway daemon status'))
        console.log(chalk.dim('   To view logs   : codeaway daemon logs'))
      } catch (err: any) {
        console.error(chalk.red(`❌ Failed to install daemon: ${err.message}`))
      }
      break
    }

    case 'uninstall': {
      try {
        uninstallDaemon()
        console.log(chalk.yellow('🗑️  CodeAway daemon uninstalled and stopped.'))
      } catch (err: any) {
        console.error(chalk.red(`❌ Failed to uninstall daemon: ${err.message}`))
      }
      break
    }

    case 'start': {
      try {
        startDaemon()
        console.log(chalk.green('▶️  CodeAway daemon started.'))
      } catch (err: any) {
        console.error(chalk.red(`❌ Failed to start daemon: ${err.message}`))
      }
      break
    }

    case 'stop': {
      try {
        stopDaemon()
        console.log(chalk.yellow('⏹️  CodeAway daemon stopped.'))
      } catch (err: any) {
        console.error(chalk.red(`❌ Failed to stop daemon: ${err.message}`))
      }
      break
    }

    case 'status': {
      const status = getDaemonStatus()
      console.log(chalk.bold('\n🖥️  CodeAway Daemon Status:'))
      if (!status.installed) {
        console.log(chalk.yellow('   State: Not installed. Run "codeaway daemon install" to set up.'))
      } else if (status.running) {
        console.log(chalk.green(`   State: Active & Running in background (PID: ${status.pid ?? 'system'})`))
        console.log(chalk.dim(`   Stdout: ${paths.stdout}`))
        console.log(chalk.dim(`   Stderr: ${paths.stderr}`))
      } else {
        console.log(chalk.red('   State: Installed but not running. Run "codeaway daemon start".'))
      }
      console.log('')
      break
    }

    case 'logs': {
      const lineCount = parseInt(opts.lines || '30', 10)
      const logs = readDaemonLogs(lineCount)
      console.log(chalk.bold.cyan(`\n📜 Daemon Logs (Last ${lineCount} lines):\n`))
      console.log(logs.stdout || '(no stdout yet)')
      if (logs.stderr && logs.stderr !== '(no logs yet)') {
        console.log(chalk.red('\nErrors:'))
        console.log(logs.stderr)
      }
      console.log('')
      break
    }

    default:
      console.log(chalk.yellow(`Unknown daemon action: "${action}"`))
      console.log('Available actions: install, uninstall, start, stop, status, logs')
  }
}
