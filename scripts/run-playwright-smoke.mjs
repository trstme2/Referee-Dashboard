import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

const port = Number(process.env.PLAYWRIGHT_PORT || 4175)
const baseURL = `http://127.0.0.1:${port}`
const isWindows = process.platform === 'win32'

function packageBin(...parts) {
  return path.join(process.cwd(), 'node_modules', ...parts)
}

function spawnLogged(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    ...options,
  })
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function killProcessTree(child) {
  if (!child.pid || child.exitCode != null) return

  if (isWindows) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    await once(killer, 'exit').catch(() => undefined)
    return
  }

  child.kill('SIGTERM')
}

const server = spawnLogged(process.execPath, [packageBin('vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    VITE_SUPABASE_ANON_KEY: '',
  },
})

let exitCode = 1

try {
  await waitForServer(baseURL)
  const playwright = spawnLogged(process.execPath, [packageBin('playwright', 'cli.js'), 'test'], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
    },
  })
  const [code] = await once(playwright, 'exit')
  exitCode = typeof code === 'number' ? code : 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  exitCode = 1
} finally {
  await killProcessTree(server)
}

process.exit(exitCode)
