import { useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { ensureSettings } from './db/db';
import { dailyReplan } from './db/repo';
import { useRoute } from './lib/router';
import { Home } from './pages/Home';
import { Placeholder } from './pages/Placeholder';
import { StudyForm } from './pages/StudyForm';
import { StudyPage } from './pages/StudyPage';

export function App() {
  const route = useRoute();
  useEffect(() => {
    const run = () => void ensureSettings().then(() => dailyReplan());
    run();
    // se o app ficar aberto de um dia para o outro
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const [a, b, c] = route;
  let page: React.ReactNode;
  let tab: 'home' | 'calendario' | 'quiz' | 'premi' | null = null;
  if (!a) {
    page = <Home />;
    tab = 'home';
  } else if (a === 'nuovo') page = <StudyForm />;
  else if (a === 'studio' && b && c === 'modifica') page = <StudyForm id={Number(b)} />;
  else if (a === 'studio' && b) page = <StudyPage id={Number(b)} />;
  else if (a === 'calendario' || a === 'quiz' || a === 'premi') {
    tab = a;
    page = <Placeholder title={{ calendario: 'Calendario', quiz: 'Quiz', premi: 'Premi' }[a]} />;
  } else if (a === 'impostazioni') page = <Placeholder title="Impostazioni" back />;
  else page = <Home />;

  return (
    <div className="app">
      {page}
      {tab && <BottomNav active={tab} />}
    </div>
  );
}
