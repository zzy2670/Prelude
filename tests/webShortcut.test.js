import test from 'node:test'
import assert from 'node:assert/strict'
import { readWebShortcut } from '../src/utils/webShortcut.js'

test('Internet Shortcut imports its title and HTTP URL as a normal web card', async () => {
  const payload = { kind: 'web-shortcut', name: 'My page.url', file: new Blob(['[InternetShortcut]\r\nURL=https://example.com/page\r\n']) }
  assert.deepEqual(await readWebShortcut(payload), { kind: 'external', source: 'tab', title: 'My page', url: 'https://example.com/page' })
})

test('UTF-16 Windows shortcut works and ordinary web drops pass through unchanged', async () => {
  const payload = { kind: 'web-shortcut', name: '本地网页.url', file: new Blob([Buffer.from('\ufeff[InternetShortcut]\r\nURL=http://127.0.0.1:8080/', 'utf16le')]) }
  assert.equal((await readWebShortcut(payload)).url, 'http://127.0.0.1:8080/')
  const ordinary = { kind: 'external', url: 'https://example.com/' }
  assert.equal(await readWebShortcut(ordinary), ordinary)
})

test('unsupported URLs and excessive files cannot be imported', async () => {
  for (const url of ['javascript:alert(1)', 'file:///private', 'data:text/plain,a']) {
    await assert.rejects(readWebShortcut({ kind: 'web-shortcut', file: new Blob([`URL=${url}`]) }))
  }
  let read = false
  await assert.rejects(readWebShortcut({ kind: 'web-shortcut', file: { size: 65537, arrayBuffer() { read = true } } }))
  assert.equal(read, false)
})
