import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

const platformNames = ['DragonFly', 'RefQuest', 'Arbiter', 'Assignr', 'HorizonWebRef']

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="Whistle Keeper home">
          <img src={logo} alt="Whistle Keeper logo" />
          <span>Whistle Keeper</span>
        </Link>
        <nav className="landing-links" aria-label="Landing page">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#records">Records</a>
          <Link to="/auth" className="landing-login">Sign in</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">Referee operations, finally organized</div>
          <h1>Manage your officiating life.</h1>
          <p>
            Whistle Keeper pulls games, pay, mileage, calendar blocks, requirements,
            and tax-ready records into one place for officials.
          </p>
          <div className="landing-actions">
            <Link to="/request-access" className="landing-cta primary">Request beta access</Link>
            <a href="#workflow" className="landing-cta secondary">See how it works</a>
          </div>
          <div className="landing-proof-row">
            <span>Assignment sync</span>
            <span>Mileage tracking</span>
            <span>Pay records</span>
          </div>
        </div>

        <div className="product-showcase" aria-label="Whistle Keeper product preview">
          <div className="showcase-topbar">
            <span />
            <span />
            <span />
            <strong>Week of Aug 24</strong>
          </div>
          <div className="showcase-body">
            <div className="showcase-schedule">
              <div className="showcase-section-title">Upcoming assignments</div>
              {[
                ['Tue', '7:00 PM', "Varsity Boy's", 'OHSAA', 'Bishop Hartley'],
                ['Thu', '5:30 PM', "Varsity Girl's", 'OHSAA', 'Pickerington North'],
                ['Sat', '10:00 AM', 'Club U17', 'USYS', 'Sports Park Field 4'],
              ].map((game) => (
                <div className="showcase-game" key={`${game[0]}-${game[1]}`}>
                  <div>
                    <span>{game[0]}</span>
                    <strong>{game[1]}</strong>
                  </div>
                  <div>
                    <strong>{game[2]}</strong>
                    <span>{game[3]}</span>
                  </div>
                  <div>{game[4]}</div>
                </div>
              ))}
            </div>
            <div className="showcase-panel">
              <div className="showcase-section-title">Week summary</div>
              <div className="showcase-stats">
                <div><strong>3</strong><span>games</span></div>
                <div><strong>29</strong><span>mi logged</span></div>
                <div><strong>$97</strong><span>expected pay</span></div>
              </div>
              <div className="showcase-section-title showcase-review-title">Sync review</div>
              <div className="showcase-review-row">
                <strong>2</strong>
                <span>matched feeds</span>
              </div>
              <div className="showcase-review-row">
                <strong>1</strong>
                <span>possible duplicate</span>
              </div>
              <div className="showcase-alert">
                <strong>Missing detail</strong>
                <span>1 assignment needs location and pay before tax season.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band" id="platform">
        <div className="landing-section-heading">
          <span>Built around the official</span>
          <h2>Not an assigning platform. Your personal officiating command center.</h2>
          <p>
            Keep the systems you already use. Whistle Keeper helps reconcile assignments
            and details from multiple systems.
          </p>
        </div>
        <div className="platform-strip" aria-label="Supported assigning platforms">
          {platformNames.map((name) => <span key={name}>{name}</span>)}
          <span>Custom iCal feeds</span>
        </div>
      </section>

      <section className="landing-feature-grid" id="workflow">
        <article className="landing-feature">
          <span className="feature-index">01</span>
          <h3>Sync without surrendering control</h3>
          <p>
            Import calendar feeds, detect likely matches, and preserve the details
            you have already reviewed or updated.
          </p>
        </article>
        <article className="landing-feature">
          <span className="feature-index">02</span>
          <h3>Turn thin feed data into complete records</h3>
          <p>
            Add league, level detail, location, pay, mileage, role, and notes once,
            then keep those enriched records intact.
          </p>
        </article>
        <article className="landing-feature">
          <span className="feature-index">03</span>
          <h3>See the week clearly</h3>
          <p>
            Review upcoming matches, blocked time, requirements, payments, and
            missing information from one working view.
          </p>
        </article>
      </section>

      <section className="landing-records" id="records">
        <div>
          <span className="landing-eyebrow">Cleaner records, less year-end work</span>
          <h2>Designed for the parts assigning systems do not manage for you.</h2>
        </div>
        <div className="records-grid">
          {[
            ['Pay', 'Know what was assigned, earned, paid, and still outstanding.'],
            ['Mileage', 'Track game travel from your saved work locations.'],
            ['Requirements', 'Stay ahead of requirements, evidence, and season tasks.'],
            ['Taxes', 'Export cleaner income and expense records when the year closes.'],
          ].map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <h2>Bring the season into focus.</h2>
        <p>Whistle Keeper gives referees a professional home for the work around the match.</p>
        <div className="landing-actions landing-final-actions">
          <Link to="/request-access" className="landing-cta primary">Request beta access</Link>
          <Link to="/auth" className="landing-cta secondary">Already invited? Sign in</Link>
        </div>
      </section>
    </main>
  )
}
