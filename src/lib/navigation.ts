export type NavItem = {
  path: string
  label: string
  shortLabel?: string
  subtitle: string
}

export const desktopNavItems: NavItem[] = [
  { path: '/', label: 'Home', subtitle: 'Dashboard' },
  { path: '/onboarding', label: 'Setup', subtitle: 'Foundation' },
  { path: '/games', label: 'Games', subtitle: 'Assignments' },
  { path: '/calendar', label: 'Calendar', subtitle: 'Schedule' },
  { path: '/sync', label: 'Sync', subtitle: 'Feeds' },
  { path: '/expenses', label: 'Expenses', subtitle: 'Ledger' },
  { path: '/tax', label: 'Tax', subtitle: 'Exports' },
  { path: '/requirements', label: 'Requirements', subtitle: 'Readiness' },
  { path: '/import', label: 'CSV Import', subtitle: 'Bring data in' },
  { path: '/settings', label: 'Settings', subtitle: 'Preferences' },
  { path: '/privacy', label: 'Privacy', subtitle: 'Data controls' },
]

export const mobilePrimaryNavItems: NavItem[] = [
  { path: '/', label: 'Home', subtitle: 'Dashboard' },
  { path: '/games', label: 'Games', subtitle: 'Assignments' },
  { path: '/calendar', label: 'Calendar', subtitle: 'Schedule' },
  { path: '/requirements', label: 'Ready', shortLabel: 'Ready', subtitle: 'Requirements' },
]

export const mobileSecondaryNavItems: NavItem[] = [
  { path: '/onboarding', label: 'Setup', subtitle: 'Foundation' },
  { path: '/sync', label: 'Sync', subtitle: 'Feeds and cleanup' },
  { path: '/expenses', label: 'Expenses', subtitle: 'Mileage and receipts' },
  { path: '/tax', label: 'Tax', subtitle: 'Review and export' },
  { path: '/import', label: 'CSV Import', subtitle: 'Bring in records' },
  { path: '/settings', label: 'Settings', subtitle: 'Preferences and calendar export' },
  { path: '/privacy', label: 'Privacy', subtitle: 'Export, reset, and delete' },
]

export function routeMetaForPath(pathname: string): NavItem {
  const all = [...desktopNavItems, ...mobileSecondaryNavItems]
  return all.find(item => item.path === pathname) ?? { path: pathname, label: 'Whistle Keeper', subtitle: 'Referee operations' }
}

export function routeIsInItems(pathname: string, items: NavItem[]): boolean {
  return items.some(item => item.path === pathname)
}
