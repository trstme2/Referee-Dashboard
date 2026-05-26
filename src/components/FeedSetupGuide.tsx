const platformGuides = [
  {
    name: 'DragonFly',
    hint: 'Start in your schedule or calendar tools. Look for subscribe, export, calendar feed, or iCal options.',
  },
  {
    name: 'RefQuest',
    hint: 'Check schedule/calendar export areas and copy the subscription link instead of downloading a one-time file.',
  },
  {
    name: 'Arbiter',
    hint: 'Look near your schedule, calendar, or profile settings for a calendar subscription or iCal feed link.',
  },
  {
    name: 'Assignr',
    hint: 'Look for calendar sync or subscription settings from your personal schedule view.',
  },
  {
    name: 'GameOfficials',
    hint: 'Start from your schedule page and scan for export, subscribe, or calendar feed actions.',
  },
  {
    name: 'Other platforms',
    hint: 'Search the assignor app for iCal, ICS, calendar feed, subscribe, export, or sync calendar.',
  },
]

type FeedSetupGuideProps = {
  compact?: boolean
}

export default function FeedSetupGuide({ compact = false }: FeedSetupGuideProps) {
  return (
    <section className={`feed-setup-guide ${compact ? 'compact' : ''}`.trim()} aria-label="Calendar feed setup guide">
      <div className="feed-guide-head">
        <strong>Common places to find iCal links</strong>
        <span>Exact labels vary by assignor.</span>
      </div>
      <div className="feed-guide-grid">
        {platformGuides.map((guide) => (
          <div className="feed-guide-item" key={guide.name}>
            <span className="pill info">{guide.name}</span>
            <p>{guide.hint}</p>
          </div>
        ))}
      </div>
      <p className="small feed-guide-note">
        Use the full subscription URL that starts with http. Whistle Keeper reads that feed and never writes back to your assigning platform.
      </p>
    </section>
  )
}
