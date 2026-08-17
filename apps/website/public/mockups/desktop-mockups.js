document.querySelectorAll('[data-desktop-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-desktop-filter]')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.desktopFilter;
    document.querySelectorAll('[data-desktop-kind]').forEach((item) => {
      item.classList.toggle('hidden', filter !== 'all' && item.dataset.desktopKind !== filter);
    });
  });
});

document.querySelectorAll('[data-workspace-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-workspace-view]')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector('.desktop-gallery').dataset.density = button.dataset.workspaceView;
  });
});
