import chalk from 'chalk'
import { getConfig, isAuthenticated } from '../core/config'

export function statusCommand() {
  console.log(chalk.bold.cyan('\n📊 CodeAway Agent Status\n'))

  const config = getConfig()

  if (!isAuthenticated()) {
    console.log(chalk.red('❌ Not logged in. Run `codeaway login` first.'))
    return
  }

  console.log(chalk.green('✅ Authenticated'))
  console.log(`   ${chalk.dim('Email:')}      ${config.email}`)
  console.log(`   ${chalk.dim('Device ID:')}  ${config.deviceId ?? chalk.yellow('not registered')}`)
  console.log(`   ${chalk.dim('Workspace:')}  ${config.workspace ?? chalk.yellow('not set')}`)
  console.log(`   ${chalk.dim('API URL:')}    ${config.apiUrl}`)
  console.log(`   ${chalk.dim('Gemini:')}     ${config.geminiApiKey ? chalk.green('configured') : chalk.yellow('not set')}`)
  console.log()
}
