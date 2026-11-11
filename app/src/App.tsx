import { useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { ensureSettings } from './db/db';
import { awardCoins, dailyReplan } from './db/repo';
import { useRoute } from './lib/router';
import { Calendario } from './pages/Calendario';
import { Home } from './pages/Home';
import { Premi } from './pages/Premi';
import { RewardForm } from './pages/RewardForm';
import { Placeholder } from './pages/Placeholder';
import { StudyForm } from './pages/StudyForm';
import { StudyPage } from './pages/StudyPage';

export function App() {
  const route = useRoute();
  useEffect(() => {
    const run = () =>
      void ensureSettings()
        .then(() => dailyReplan())
        .then(() => awardCoins());
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
  else if (a === 'premi' && b === 'nuovo') page = <RewardForm />;
  else if (a === 'premi' && b && c === 'modifica') page = <RewardForm id={Number(b)} />;
  else if (a === 'premi') {
    tab = 'premi';
    page = <Premi />;
  } else if (a === 'calendario') {
    tab = 'calendario';
    page = <Calendario />;
  } else if (a === 'quiz') {
    tab = 'quiz';
    page = <Placeholder title="Quiz" />;
  } else if (a === 'impostazioni') page = <Placeholder title="Impostazioni" back />;
  else page = <Home />;

  return (
    <div className="app">
      {page}
      {tab && <BottomNav active={tab} />}
    </div>
  );
}
