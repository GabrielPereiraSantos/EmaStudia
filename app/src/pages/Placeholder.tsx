import { BackButton } from '../components/BackButton';

export function Placeholder({ title, back }: { title: string; back?: boolean }) {
  return (
    <div className="page">
      <div className="page-head">
        {back && <BackButton onClick={() => (location.hash = '#/')} />}
        <h1>{title}</h1>
      </div>
      <p className="empty">In arrivo.</p>
    </div>
  );
}
