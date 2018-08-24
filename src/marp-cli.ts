import { Marp } from '@marp-team/marp-core'
import { version as coreVersion } from '@marp-team/marp-core/package.json'
import globby from 'globby'
import osLocale from 'os-locale'
import path from 'path'
import { Argv } from 'yargs'
import yargs from 'yargs/yargs'
import * as cli from './cli'
import { Converter, ConvertType } from './converter'
import { CLIError, error } from './error'
import { MarpReadyScript } from './ready'
import templates from './templates'
import { name, version } from '../package.json'

enum OptionGroup {
  Basic = 'Basic Options:',
  Converter = 'Converter Options:',
}

const usage = `
Usage:
  marp [options] <files...>
`.trim()

export default async function(argv: string[] = []): Promise<number> {
  try {
    const base: Argv = yargs(argv)
    const program = base
      .usage(usage)
      .help(false)
      .version(
        'version',
        'Show package versions',
        `${name} v${version} (/w @marp-team/marp-core v${coreVersion})`
      )
      .alias('version', 'v')
      .group('version', OptionGroup.Basic)
      .options({
        help: {
          alias: 'h',
          describe: 'Show help',
          group: OptionGroup.Basic,
          type: 'boolean',
        },
        output: {
          alias: 'o',
          describe: 'Output file name',
          group: OptionGroup.Basic,
          type: 'string',
        },
        pdf: {
          default: false,
          describe: 'Convert slide deck into PDF',
          group: OptionGroup.Converter,
          type: 'boolean',
        },
        template: {
          describe: 'Template name',
          group: OptionGroup.Converter,
          choices: Object.keys(templates),
          type: 'string',
        },
        theme: {
          describe: 'Override theme',
          group: OptionGroup.Converter,
          type: 'string',
        },
      })

    const args = program.argv

    if (args.help) {
      program.showHelp()
      return 0
    }

    // Initialize converter
    const converter = new Converter({
      engine: Marp,
      lang: (await osLocale()).replace(/[_@]/g, '-'),
      options: {},
      output: args.output,
      readyScript: await MarpReadyScript.bundled(),
      template: args.template || 'bare',
      theme: args.theme,
      type:
        args.pdf || `${args.output}`.toLowerCase().endsWith('.pdf')
          ? ConvertType.pdf
          : ConvertType.html,
    })

    // Find target markdown files
    const files = await globby(args._, {
      absolute: true,
      expandDirectories: { files: ['*.md', '*.mdown', '*.markdown'] },
    })

    if (files.length === 0) {
      if (args._.length > 0)
        cli.warn('Not found processable Markdown file(s).\n')

      program.showHelp()
      return args._.length > 0 ? 1 : 0
    }

    const plural = files.length > 1 ? 's' : ''
    cli.info(`Converting ${files.length} file${plural}...`)

    // Convert markdown into HTML
    try {
      await converter.convertFiles(files, ret => {
        const from = path.relative(process.cwd(), ret.path)
        const output =
          ret.output === '-'
            ? '[stdout]'
            : path.relative(process.cwd(), ret.output)

        cli.info(`${from} => ${output}`)
        if (ret.output === '-') console.log(ret.result)
      })
    } catch (e) {
      error(`Failed converting Markdown. (${e.message})`, e.errorCode)
    }

    return 0
  } catch (e) {
    if (!(e instanceof CLIError)) throw e

    cli.error(e.message)
    return e.errorCode
  }
}
