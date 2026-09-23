import { expect, test } from 'bun:test';

// Bun module mocks are process-global. Keep provider/DB mocks out of other suites.
if (process.env.CLAIRE_OUTBOX_TEST_CHILD === '1') {
  await import('./proactive-outbox.cases');
} else {
  test('proactive outbox regressions pass in an isolated process', async () => {
    const child = Bun.spawn([process.execPath, 'test', import.meta.path], {
      env: { ...process.env, CLAIRE_OUTBOX_TEST_CHILD: '1' },
      stdout: 'pipe', stderr: 'pipe',
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    if (status !== 0) throw new Error(`Outbox regression subprocess failed:\n${stdout}\n${stderr}`);
    expect(status).toBe(0);
  }, 30_000);
}
