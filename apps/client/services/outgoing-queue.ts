import { userFacingErrorMessage } from './api-errors';

/** Durable FIFO per conversation. A failed conversation cannot block another. */
export interface QueueEntry {
  id: string;
  chatId: string;
  error?: string;
}
export class OutgoingQueue<T extends QueueEntry> {
  entries: T[] = [];
  private ready?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private flushing = false;
  constructor(private readonly options: {
    read: () => Promise<T[]>;
    write: (entries: T[]) => Promise<void>;
    execute: (entry: T) => Promise<void>;
    retryable: (error: unknown) => boolean;
    active: () => boolean;
    changed: () => void;
  }) {}
  hydrate() {
    return this.ready ||= this.options.read().then((entries) => {
      this.entries = entries;
      this.options.changed();
    }).catch((error) => { this.ready = undefined; throw error; });
  }
  private update(transform: (entries: T[]) => T[]) {
    const write = this.writes.then(async () => {
      const next = transform(this.entries);
      await this.options.write(next);
      this.entries = next;
      this.options.changed();
    });
    this.writes = write.catch(() => undefined);
    return write;
  }
  async enqueue(entry: T) {
    await this.hydrate();
    await this.update((entries) => entries.some((item) => item.id === entry.id) ? entries : [...entries, entry]);
  }
  async remove(id: string) { await this.update((entries) => entries.filter((item) => item.id !== id)); }
  async retry(chatId?: string) { await this.update((entries) => entries.map((entry) => {
    if (chatId && entry.chatId !== chatId) return entry;
    const { error: _, ...pending } = entry;
    return pending as T;
  })); }
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.hydrate();
      const blocked = new Set<string>();
      for (const entry of [...this.entries]) {
        if (!this.options.active()) break;
        if (blocked.has(entry.chatId)) continue;
        if (entry.error) { blocked.add(entry.chatId); continue; }
        try {
          await this.options.execute(entry);
          if (!this.options.active()) break;
          await this.remove(entry.id);
        } catch (error) {
          if (!this.options.active()) break;
          blocked.add(entry.chatId);
          if (!this.options.retryable(error)) {
            await this.update((entries) => entries.map((item) => item.id === entry.id
              ? { ...item, error: userFacingErrorMessage(error, 'Could not send. Try again.') } : item));
          }
        }
      }
    } finally { this.flushing = false; }
  }
}
