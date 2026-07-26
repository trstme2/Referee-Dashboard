import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const audit = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

if (audit.error) {
  console.error(`Unable to run npm audit: ${audit.error.message}`)
  process.exit(1)
}

let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  console.error('npm audit did not return a readable JSON report.')
  if (audit.stderr) console.error(audit.stderr.trim())
  process.exit(1)
}

const acceptedAdvisoryUrls = new Set([
  // Whistle Keeper is a Vite BrowserRouter SPA and does not enable React Router RSC mode.
  'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
])

const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 }

function isAcceptedArchitectureSpecificFinding(vulnerability) {
  const findings = Array.isArray(vulnerability.via) ? vulnerability.via : []
  return findings.length > 0 && findings.every(finding => (
    typeof finding === 'object' && acceptedAdvisoryUrls.has(finding.url)
  ))
}

const vulnerabilitiesByName = report.vulnerabilities || {}

function isAcceptedFindingOrItsAffectedWrapper(name, seen = new Set()) {
  if (seen.has(name)) return false
  const vulnerability = vulnerabilitiesByName[name]
  if (!vulnerability) return false
  if (isAcceptedArchitectureSpecificFinding(vulnerability)) return true

  const findings = Array.isArray(vulnerability.via) ? vulnerability.via : []
  return findings.length > 0 && findings.every(finding => (
    typeof finding === 'string'
    && isAcceptedFindingOrItsAffectedWrapper(finding, new Set([...seen, name]))
  ))
}

const vulnerabilities = Object.entries(vulnerabilitiesByName)
  .map(([name, vulnerability]) => ({ name, ...vulnerability }))
const ignored = vulnerabilities.filter(vulnerability => isAcceptedFindingOrItsAffectedWrapper(vulnerability.name))
const blocking = vulnerabilities.filter(vulnerability => (
  severityRank[vulnerability.severity] >= severityRank.high
  && !isAcceptedFindingOrItsAffectedWrapper(vulnerability.name)
))

for (const vulnerability of ignored) {
  console.log(`Accepted architecture-specific advisory: ${vulnerability.name}`)
}

if (blocking.length > 0) {
  console.error('Blocking production dependency advisories found:')
  for (const vulnerability of blocking) {
    console.error(`- ${vulnerability.name} (${vulnerability.severity})`)
  }
  process.exit(1)
}

console.log('Production dependency audit passed.')
