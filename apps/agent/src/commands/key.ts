import chalk from 'chalk'
import { saveConfig, getConfig } from '../core/config'

export function keyCommand(action: string, provider?: string, key?: string) {
  const config = getConfig()

  if (action === 'set') {
    if (!provider || !key) {
      console.log(chalk.yellow('Usage: codeaway key set <gemini|anthropic|openai> <api_key>'))
      return
    }

    const prov = provider.toLowerCase()
    if (prov === 'gemini') {
      saveConfig({ geminiApiKey: key })
      console.log(chalk.green('✅ Gemini API key saved!'))
    } else if (prov === 'anthropic' || prov === 'claude') {
      saveConfig({ anthropicApiKey: key })
      console.log(chalk.green('✅ Anthropic (Claude) API key saved!'))
    } else if (prov === 'openai' || prov === 'chatgpt') {
      saveConfig({ openaiApiKey: key })
      console.log(chalk.green('✅ OpenAI API key saved!'))
    } else {
      console.log(chalk.red(`❌ Unknown provider: ${provider}. Use gemini, anthropic, or openai.`))
    }
  } else if (action === 'list') {
    console.log(chalk.bold.cyan('\n🔑 Configured AI Providers:\n'))
    console.log(`   Gemini (Google)     : ${config.geminiApiKey ? chalk.green('Configured') : chalk.yellow('Not set')}`)
    console.log(`   Claude (Anthropic)  : ${config.anthropicApiKey ? chalk.green('Configured') : chalk.yellow('Not set')}`)
    console.log(`   OpenAI (GPT-4o)     : ${config.openaiApiKey ? chalk.green('Configured') : chalk.yellow('Not set')}`)
    console.log(chalk.dim('\nTo set a key: codeaway key set <provider> <YOUR_KEY>\n'))
  } else {
    console.log(chalk.yellow('Usage: codeaway key <set|list> [provider] [api_key]'))
  }
}
