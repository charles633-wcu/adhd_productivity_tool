import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const nextBin = resolve('node_modules/next/dist/bin/next')
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3020'], {
  env: {
    ...process.env,
    NEXT_PUBLIC_BASE_URL: 'http://127.0.0.1:3020',
  },
  stdio: 'inherit',
})

function stop() {
  if (child.pid == null || child.killed) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

process.on('SIGTERM', () => {
  stop()
  process.exit(143)
})

process.on('exit', stop)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
