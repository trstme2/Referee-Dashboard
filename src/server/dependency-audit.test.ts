import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function runAudit(report: unknown, status: number | null = 0) {
  // Replace only npm's response; execute the real release gate in a child process.
  const source = `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawnSync = () => (${JSON.stringify({ stdout: JSON.stringify(report), status })});
    syncBuiltinESMExports();
    await import('./scripts/audit-production-dependencies.mjs');
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })
}

describe('production dependency audit gate', () => {
  it('passes a complete clean report', () => {
    expect(runAudit({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }).status).toBe(0)
  })
  it.each([{ error: { code: 'ENETUNREACH' } }, {}, null])('fails closed on audit errors or incomplete reports', report => {
    expect(runAudit(report, 1).status).toBe(1)
  })
  it('rejects a terminated audit process', () => {
    expect(runAudit({ metadata: { vulnerabilities: {} }, vulnerabilities: {} }, null).status).toBe(1)
  })
  it('rejects a high severity production advisory', () => {
    expect(runAudit({
      metadata: { vulnerabilities: { high: 1 } },
      vulnerabilities: { example: { severity: 'high', via: [{ url: 'https://example.com/advisory' }] } },
    }, 1).status).toBe(1)
  })
})
