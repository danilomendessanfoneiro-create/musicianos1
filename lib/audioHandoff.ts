/**
 * Entrega um arquivo de áudio para outra tela do app (hoje, o Analisador de
 * Áudio) sem passar por URL nem por estado global: grava um pacote único no
 * IndexedDB, que a tela de destino consome e apaga.
 */
import { getFile, putFile } from './vsLibrary';

const KEY = 'handoff:pending';
const NAME_KEY = 'musicianos:handoff-name';

export async function sendAudioTo(blob: Blob, name: string): Promise<void> {
  await putFile(KEY, blob);
  sessionStorage.setItem(NAME_KEY, name);
}

export async function takePendingAudio(): Promise<{ blob: Blob; name: string } | null> {
  const blob = await getFile(KEY);
  if (!blob) return null;
  const name = sessionStorage.getItem(NAME_KEY) || 'pista.wav';
  sessionStorage.removeItem(NAME_KEY);
  return { blob, name };
}
