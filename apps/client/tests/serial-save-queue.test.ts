import { createSerialSaveQueue } from '../features/settings/serial-save-queue';

describe('serial save queue', () => {
  it('persists rapid changes in the order they were made', async () => {
    const saved: number[] = [];
    const enqueue = createSerialSaveQueue<number>(async (value) => {
      if (value === 1) await new Promise((resolve) => setTimeout(resolve, 5));
      saved.push(value);
    });

    await Promise.all([enqueue(1), enqueue(2), enqueue(3)]);

    expect(saved).toEqual([1, 2, 3]);
  });

  it('continues saving later changes after one request fails', async () => {
    const saved: number[] = [];
    const enqueue = createSerialSaveQueue<number>(async (value) => {
      if (value === 1) throw new Error('offline');
      saved.push(value);
    });

    await expect(enqueue(1)).rejects.toThrow('offline');
    await expect(enqueue(2)).resolves.toBeUndefined();

    expect(saved).toEqual([2]);
  });
});
