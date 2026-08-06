// Tiny module-level pub/sub for long-running actions that shouldn't block a
// modal (e.g. CreateInvoiceModal.tsx's save, which links every selected
// fee/disbursement row one at a time and can visibly take a while on an
// invoice with many lines). A plain module-level store rather than React
// state on the triggering component: the whole point is that the task keeps
// running -- and stays visible -- after the component that started it
// closes or the user navigates away, and a promise chain that only closes
// over that component's own setState calls has no way to report back once
// it's gone. Deliberately NOT a full toast/notification library -- this app
// has none yet (see BackgroundTasksTray.tsx, its only renderer), and one
// task type doesn't justify building one.
export interface BackgroundTask {
  id: string;
  label: string;
  done: number;
  total: number;
  status: 'running' | 'done' | 'error';
  resultLabel?: string;
  resultHref?: string;
  errorMessage?: string;
}

type Listener = (tasks: BackgroundTask[]) => void;

let tasks: BackgroundTask[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(l => l(tasks));
}

export function startBackgroundTask(id: string, label: string, total: number): void {
  tasks = [...tasks.filter(t => t.id !== id), { id, label, done: 0, total, status: 'running' }];
  emit();
}

export function updateBackgroundTask(id: string, patch: Partial<BackgroundTask>): void {
  tasks = tasks.map(t => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

export function dismissBackgroundTask(id: string): void {
  tasks = tasks.filter(t => t.id !== id);
  emit();
}

export function subscribeBackgroundTasks(listener: Listener): () => void {
  listeners.add(listener);
  listener(tasks);
  return () => { listeners.delete(listener); };
}
