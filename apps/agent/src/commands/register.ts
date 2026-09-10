import chalk from 'chalk'
import prompts from 'prompts'
import ora from 'ora'
import { api } from '../core/api'
import { saveConfig, getConfig } from '../core/config'

export async function registerCommand() {
  console.log(chalk.bold.cyan('\n📝 CodeAway — Register Account\n'))

  const answers = await prompts([
    { type: 'text', name: 'apiUrl', message: 'Backend URL', initial: getConfig().apiUrl || 'http://localhost:3001' },
    { type: 'text', name: 'name', message: 'Your Name' },
    { type: 'text', name: 'email', message: 'Email' },
    { type: 'password', name: 'password', message: 'Password (min 8 chars)' },
  ])

  if (!answers.name || !answers.email || !answers.password) {
    console.log(chalk.red('Cancelled.'))
    process.exit(0)
  }

  saveConfig({ apiUrl: answers.apiUrl })

  const spinner = ora('Creating account...').start()

  try {
    const res = await api.post('/auth/register', {
      name: answers.name,
      email: answers.email,
      password: answers.password,
    })
    const { token, user } = res.data
    saveConfig({ token, userId: user.id, email: user.email })
    spinner.succeed(chalk.green(`✅ Registered and logged in as ${user.email}`))
    console.log(chalk.dim('\nRun `codeaway connect` to start the agent.\n'))
  } catch (err: unknown) {
    spinner.fail(chalk.red('Registration failed'))
    const msg = (err as any).response?.data?.error ?? (err as Error).message
    console.error(chalk.red(msg))
    process.exit(1)
  }
}
