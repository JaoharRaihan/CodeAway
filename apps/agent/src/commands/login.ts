import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'
import { api } from '../core/api'
import { saveConfig, getConfig } from '../core/config'

export async function loginCommand() {
  console.log(chalk.bold.cyan('\n🔐 CodeAway — Login\n'))

  const answers = await prompts([
    { type: 'text', name: 'apiUrl', message: 'Backend URL', initial: getConfig().apiUrl || 'http://localhost:3001' },
    { type: 'text', name: 'email', message: 'Email' },
    { type: 'password', name: 'password', message: 'Password' },
  ])

  if (!answers.email || !answers.password) {
    console.log(chalk.red('Cancelled.'))
    process.exit(0)
  }

  saveConfig({ apiUrl: answers.apiUrl })

  const spinner = ora('Authenticating...').start()

  try {
    const res = await api.post('/auth/login', { email: answers.email, password: answers.password })
    const { token, user } = res.data
    saveConfig({ token, userId: user.id, email: user.email })
    spinner.succeed(chalk.green(`✅ Logged in as ${user.email}`))
    console.log(chalk.dim('\nRun `codeaway connect` to start the agent.\n'))
  } catch (err: unknown) {
    spinner.fail(chalk.red('Login failed'))
    const msg = (err as any).response?.data?.error ?? (err as Error).message
    console.error(chalk.red(msg))
    process.exit(1)
  }
}
