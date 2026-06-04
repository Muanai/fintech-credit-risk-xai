import ownLogo from '../../assets/logo.svg'

export function MobileBlocker() {
  return (
    <div className="mobile-blocker">
      <div className="mobile-blocker-content">
        <div className="mobile-blocker-logo">
          <img src={ownLogo} alt="Logo" />
          <span>Credit Auditor</span>
        </div>
        <h1 className="mobile-blocker-title">Desktop site only.</h1>
        <p className="mobile-blocker-desc">
          This internal tool is designed for desktop screens to ensure full data visibility and support complex interactions. Please access it from a computer to continue.
        </p>
      </div>
    </div>
  )
}
