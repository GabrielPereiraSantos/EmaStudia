import { useEffect } from 'react';
import { db } from './db/db';
import { useLive } from './lib/useLive';
import { startAutoSync } from './lib/sync';
import { Benvenuta } from './pages/Benvenuta';
import { Impostazioni } from './pages/Impostazioni';
import { BottomNav } from './components/BottomNav';
import { ensureSettings } from './db/db';
import { awardCoins, dailyReplan } from './db/repo';
import { useRoute } from './lib/router';
import { Calendario } from './pages/Calendario';
import { Home } from './pages/Home';
import { Premi } from './pages/Premi';
import { QuizList } from './pages/QuizList';
import { QuizPlay } from './pages/QuizPlay';
import { QuizWrite } from './pages/QuizWrite';
import { RewardForm } from './pages/RewardForm';
import { StudyForm } from './pages/StudyForm';
import { StudyPage } from './pages/StudyPage';

export function App() {
  const route = useRoute();
  const settings = useLive(() => db.settings.get(1), []);
  const ready = settings?.welcomeDone === true;

  // Agenda de notificações: sincroniza ao abrir e a cada mudança (depois da Benvenuta).
  useEffect(() => (ready ? startAutoSync() : undefined), [ready]);

  // Toque numa notificação com o app já aberto: o service worker pede a navegação.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const url = (e.data as { type?: string; url?: string } | null)?.url;
      if (
        (e.data as { type?: string })?.type === 'navigate' &&
        typeof url === 'string' &&
        url.startsWith('/#/')
      ) {
        location.hash = url.slice(1);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    const run = () =>
      void ensureSettings()
        .then(() => dailyReplan())
        .then(() => awardCoins())
        .then(() => import('./db/quizRepo'))
        .then((m) => m.ensureQuizzes());
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
  } else if (a === 'quiz' && b && c === 'scrivi') page = <QuizWrite id={Number(b)} />;
  else if (a === 'quiz' && b) page = <QuizPlay id={Number(b)} />;
  else if (a === 'quiz') {
    tab = 'quiz';
    page = <QuizList />;
  } else if (a === 'impostazioni') page = <Impostazioni />;
  else page = <Home />;

  if (!settings) return <div className="app" />;
  if (!ready)
    return (
      <div className="app">
        <Benvenuta />
      </div>
    );

  return (
    <div className="app">
      <main>{page}</main>
      {tab && <BottomNav active={tab} />}
    </div>
  );
}
