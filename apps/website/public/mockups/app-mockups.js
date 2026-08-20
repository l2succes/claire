document.querySelectorAll('[data-gallery-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-gallery-filter]')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.galleryFilter;
    document
      .querySelectorAll('.screen-case[data-kind]')
      .forEach((screen) =>
        screen.classList.toggle('hidden', filter !== 'all' && screen.dataset.kind !== filter)
      );
    document
      .querySelectorAll('[data-gallery-section]')
      .forEach((section) =>
        section.classList.toggle(
          'hidden',
          filter !== 'all' && section.dataset.gallerySection !== filter
        )
      );
  });
});
document.querySelectorAll('.relationship-chip').forEach((button) =>
  button.addEventListener('click', () => {
    button
      .closest('.relationship-grid')
      .querySelectorAll('.relationship-chip')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  })
);
document.querySelectorAll('.tone-card').forEach((button) =>
  button.addEventListener('click', () => {
    button
      .closest('.tone-grid')
      .querySelectorAll('.tone-card')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  })
);

document.querySelectorAll('.message-actions-trigger').forEach((trigger) => {
  const screen = trigger.closest('.action-screen');
  const sheet = screen?.querySelector('.message-action-sheet');
  const backdrop = screen?.querySelector('.message-sheet-backdrop');

  const closeSheet = () => {
    screen?.classList.remove('sheet-open');
    trigger.setAttribute('aria-expanded', 'false');
    sheet?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('tabindex', '-1');
  };

  const openSheet = () => {
    screen?.classList.add('sheet-open');
    trigger.setAttribute('aria-expanded', 'true');
    sheet?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    backdrop?.removeAttribute('tabindex');
  };

  trigger.addEventListener('click', openSheet);
  backdrop?.addEventListener('click', closeSheet);
});
