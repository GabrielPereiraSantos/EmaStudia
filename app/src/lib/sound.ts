/** Som do fim do pomodoro. No iOS o áudio só toca depois de ser "desbloqueado" por um toque. */
const SRC = '/sons/fim.mp3';
let audio: HTMLAudioElement | null = null;

const get = () => {
  if (!audio) {
    audio = new Audio(SRC);
    audio.preload = 'auto';
  }
  return audio;
};

/** Chamar no toque em "Inizia": toca mudo e pausa, o que libera o áudio para depois. */
export function unlockSound() {
  try {
    const a = get();
    a.muted = true;
    const p = a.play();
    const reset = () => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
    };
    if (p) p.then(reset).catch(() => (a.muted = false));
    else reset();
  } catch {
    /* sem áudio: segue sem som */
  }
}

/** Fim do pomodoro com o app na tela. */
export function playEndSound() {
  try {
    const a = get();
    a.muted = false;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* sem áudio */
  }
  navigator.vibrate?.([200, 100, 200]);
}
