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
