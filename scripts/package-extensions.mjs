import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = path.join(root, 'dist')
const output = path.join(root, 'release')
if (!existsSync(path.join(dist, 'manifest.json'))) throw new Error('Run npm run build before packaging')
const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'))
const version = manifest.version
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+(?:\.\d+){0,2}$/.test(version)) throw new Error('Invalid extension version')
const normalizedVersion = (value) => value.split('.').concat(['0','0','0','0']).slice(0,4).join('.')
if (normalizedVersion(version) !== normalizedVersion(packageVersion) || manifest.manifest_version !== 3) throw new Error('Built manifest does not match the MV3 package version')
if (manifest.permissions?.includes('nativeMessaging')) throw new Error('Public packages must not request nativeMessaging')

function buildFiles(directory, prefix = '') {
  return readdirSync(directory).sort().flatMap((name) => {
    const absolute = path.join(directory, name)
    const relative = prefix + name
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in a release: ${relative}`)
    if (stat.isDirectory()) return buildFiles(absolute, `${relative}/`)
    const allowed = ['manifest.json', 'index.html', 'background.js'].includes(relative)
      || /^_locales\/(?:en|zh_CN)\/messages\.json$/.test(relative)
      || /^assets\/[a-zA-Z0-9_-]+\.(?:js|css|woff2?|ttf|svg)$/.test(relative)
      || /^icons\/icon-\d+\.png$/.test(relative)
    if (!stat.isFile() || !allowed) throw new Error(`Unexpected build file; review before publishing: ${relative}`)
    if (/\.(?:json|js|css|html)$/.test(relative)) {
      const text = readFileSync(absolute, 'utf8')
      if (/[a-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]/i.test(text) || /\/Users\/[^/]+\//.test(text)) {
        throw new Error(`Local user path found in public build: ${relative}`)
      }
    }
    return [{ absolute, relative }]
  })
}

function deploymentFiles() {
  const paths = ['AGENTS.md', 'scripts/prepare-install.ps1']
  function collect(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name)
      const relative = `${prefix}/${name}`
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) throw new Error(`Deployment files cannot contain links: ${relative}`)
      if (stat.isDirectory()) collect(absolute, relative)
      else paths.push(relative)
    }
  }
  collect(path.join(root, '.agents/skills/deploy-prelude'), '.agents/skills/deploy-prelude')
  return paths.sort().map((relative) => {
    if (!/^[a-zA-Z0-9_./-]+\.(?:md|ps1)$/.test(relative)) throw new Error(`Unexpected deployment resource: ${relative}`)
    const absolute = path.join(root, relative)
    if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error(`Invalid deployment resource: ${relative}`)
    const content = readFileSync(absolute, 'utf8')
    if (/[a-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]/i.test(content) || /\/Users\/[^/]+\//.test(content)) throw new Error(`Private local path found in deployment resource: ${relative}`)
    return { absolute, relative }
  })
}

const files = [...buildFiles(dist), ...deploymentFiles()]
const license = path.join(root, 'LICENSE')
if (!existsSync(license)) throw new Error('LICENSE is required in every distributed package')
const licenseText = readFileSync(license, 'utf8')
if (!licenseText.includes('MIT License') || !licenseText.includes('Permission is hereby granted')) throw new Error('Expected the preserved MIT license')

const candidates = process.platform === 'win32'
  ? [{ command: 'python', args: [] }, { command: 'py', args: ['-3'] }, { command: 'python3', args: [] }]
  : [{ command: 'python3', args: [] }, { command: 'python', args: [] }]
const python = candidates.find(({ command, args }) => spawnSync(command, [...args, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).status === 0)
if (!python) throw new Error('Python 3 is required to create the extension ZIP packages')

const installation = `序页 / Prelude ${version}

安装（Chrome / Edge）
1. 将 ZIP 解压到一个长期保留的文件夹。
2. Chrome 打开 chrome://extensions；Edge 打开 edge://extensions。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。
4. 打开新标签页即可使用。安装后保留该文件夹。

Install (Chrome / Edge)
1. Extract this ZIP into a permanent folder.
2. Open chrome://extensions in Chrome, or edge://extensions in Edge.
3. Enable Developer mode, choose Load unpacked, and select the folder containing manifest.json.
4. Open a new tab. Keep the extracted folder after installation.

让 AI 部署：请阅读本包 AGENTS.md，使用随附 deploy-prelude skill 把序页部署到我的 Chrome，并验证新标签页。
AI-assisted deployment: Read the included AGENTS.md and use the bundled deploy-prelude skill to install Prelude in my Chrome and verify a real new tab.
需要具备本机 Windows PowerShell / UI Automation 能力的 AI。默认仅 Chrome；Edge 需明确指定。
Requires an AI with local Windows PowerShell and UI Automation access. Chrome is the default; request Edge explicitly.

Both packages contain the same Chromium Manifest V3 build. Browser profiles keep their own cards and settings.
Source and releases: https://github.com/zzy2670/Prelude
`

const zipProgram = `
import json, pathlib, sys, zipfile
source, output, version = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
files = sorted(p for p in source.rglob('*') if p.is_file())
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        entry = zipfile.ZipInfo(file.relative_to(source).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(entry, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(output, 'r') as archive:
    assert archive.testzip() is None, 'ZIP integrity check failed'
    assert len(archive.namelist()) == len(files), 'ZIP file count mismatch'
    assert json.loads(archive.read('manifest.json'))['version'] == version, 'ZIP version mismatch'
    assert archive.read('LICENSE') == (source / 'LICENSE').read_bytes(), 'ZIP license mismatch'
    assert 'INSTALL.txt' in archive.namelist(), 'ZIP installation instructions missing'
print(json.dumps({'files': len(files), 'verified': True}))
`

const temporary = mkdtempSync(path.join(tmpdir(), 'prelude-release-'))
const temporaryResolved = realpathSync(temporary)
try {
  for (const { absolute, relative } of files) {
    const destination = path.join(temporary, ...relative.split('/'))
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(absolute, destination)
  }
  copyFileSync(license, path.join(temporary, 'LICENSE'))
  writeFileSync(path.join(temporary, 'INSTALL.txt'), installation, 'utf8')
  mkdirSync(output, { recursive: true })
  const artifacts = []
  for (const browser of ['Chrome', 'Edge']) {
    const name = `Prelude-${version}-${browser}.zip`
    const result = spawnSync(python.command, [...python.args, '-c', zipProgram, temporary, path.join(output, name), version], { encoding: 'utf8', windowsHide: true, timeout: 120000 })
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `Could not create ${name}`)
    artifacts.push(name)
  }
  copyFileSync(license, path.join(output, 'LICENSE'))
  artifacts.push('LICENSE')
  const checksums = artifacts.map((name) => `${createHash('sha256').update(readFileSync(path.join(output, name))).digest('hex')}  ${name}`)
  writeFileSync(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n', 'utf8')
  console.log(`Packaged Prelude ${version}: ${files.length} build files plus LICENSE and INSTALL.txt per ZIP.`)
  console.log(checksums.join('\n'))
} finally {
  const tempParent = realpathSync(tmpdir())
  if (realpathSync(temporary) !== temporaryResolved || path.dirname(temporaryResolved) !== tempParent || !path.basename(temporaryResolved).startsWith('prelude-release-')) {
    throw new Error('Refusing to clean an unexpected temporary directory')
  }
  rmSync(temporaryResolved, { recursive: true, force: true })
}
