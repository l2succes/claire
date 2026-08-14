const installCommands = {
  mac: `git clone https://github.com/l2succes/claire.git
cd claire
bun run install:server && bun run install:client
bun run docker:up
bun run dev`,
  windows: `git clone https://github.com/l2succes/claire.git
cd claire
bun run install:server && bun run install:client
bun run docker:up
bun run dev`,
  linux: `git clone https://github.com/l2succes/claire.git
cd claire
bun run install:server && bun run install:client
bun run docker:up
bun run dev`,
  bun: `git clone https://github.com/l2succes/claire.git
cd claire/server && bun install
cd ../client && bun install
cd .. && bun run docker:up && bun run dev`,
};
document.querySelectorAll('[role="tab"]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document
      .querySelectorAll('[role="tab"]')
      .forEach((item) => item.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    document.querySelector('#install-command').textContent = installCommands[tab.dataset.tab];
  })
);
document.querySelectorAll('.copy-button').forEach((button) =>
  button.addEventListener('click', async () => {
    const original = button.textContent,
      text = document.getElementById(button.dataset.copyTarget).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied ✓';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copyTarget));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      button.textContent = 'Selected';
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  })
);
document.querySelectorAll('details').forEach((detail) =>
  detail.addEventListener('toggle', () => {
    if (detail.open)
      document.querySelectorAll('details').forEach((other) => {
        if (other !== detail) other.open = false;
      });
  })
);
