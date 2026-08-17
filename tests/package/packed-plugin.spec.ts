import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const artifacts = join(root, '.test-artifacts')
const unpacked = join(artifacts, 'unpacked')
let packageRoot = ''

beforeAll(() => {
  rmSync(artifacts, { recursive: true, force: true })
  mkdirSync(unpacked, { recursive: true })
  execFileSync('pnpm', ['pack', '--pack-destination', artifacts], { cwd: root, stdio: 'pipe' })
  const tarball = readdirSync(artifacts).find(file => file.endsWith('.tgz'))
  if (tarball === undefined) throw new Error('pnpm pack produced no tarball')
  execFileSync('tar', ['-xzf', join(artifacts, tarball), '-C', unpacked])
  packageRoot = join(unpacked, 'package')
})

afterAll(() => { rmSync(artifacts, { recursive: true, force: true }) })

describe('packed community plugin', () => {
  it('contains both runtime entries, declarations, paired docs, and license', () => {
    for (const path of [
      'lib/index.js',
      'lib/client.js',
      'lib/types/index.d.ts',
      'lib/types/client/index.d.ts',
      'README.md',
      'README.zh.md',
      'LICENSE',
      'cordis.patch.yml',
    ]) expect(() => readFileSync(join(packageRoot, path))).not.toThrow()
  })

  it('declares the DSH browser entry and imports its Node entry under plain Node', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dsh?: { client?: { platform?: string }; bundle?: { patch?: string } }
      repository?: { url?: string }
      bugs?: { url?: string }
      homepage?: string
    }
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.repository?.url).toBe(
      'git+https://github.com/Jian-Sparrow/dsh-plugin-mission-control.git',
    )
    expect(manifest.bugs?.url).toBe(
      'https://github.com/Jian-Sparrow/dsh-plugin-mission-control/issues',
    )
    expect(manifest.homepage).toBe(
      'https://github.com/Jian-Sparrow/dsh-plugin-mission-control#readme',
    )
    expect(() => execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(join(packageRoot, 'lib/index.js'))})`],
      { cwd: root, stdio: 'pipe' },
    )).not.toThrow()
  })

  it('keeps framework runtimes external and contains no local workspace path', () => {
    const client = readFileSync(join(packageRoot, 'lib/client.js'), 'utf8')
    expect(client).toContain('require("react")')
    expect(client).toContain('require("react/jsx-runtime")')
    expect(client).not.toContain('/Users/')
    expect(client).not.toContain('node_modules/@deepseek-ai/cordis')
  })
})
