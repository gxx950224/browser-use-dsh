#!/usr/bin/env node
/**
 * Serve examples/test-page.html on a loopback port for live Browser Use tests.
 * Usage: node examples/serve-test-page.mjs [port]
 */

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
const port = Number(process.argv[2] || 8899)
const pagePath = join(root, 'test-page.html')

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/' || request.url.startsWith('/?') || request.url === '/index.html') {
      const html = await readFile(pagePath)
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(html)
      return
    }
    if (request.url === '/docs') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end('<h1>本地文档页</h1><p>用于测试链接与 verify。</p>')
      return
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('not found')
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(`server error: ${error && error.message ? error.message : error}`)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`browser-use test page: http://127.0.0.1:${port}/`)
})
