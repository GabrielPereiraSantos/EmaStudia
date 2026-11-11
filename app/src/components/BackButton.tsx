export function BackButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      className="round-btn"
      aria-label="Indietro"
      onClick={onClick ?? (() => history.back())}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
