import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Consulta reativa ao Dexie (atualiza quando os dados mudam). */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
