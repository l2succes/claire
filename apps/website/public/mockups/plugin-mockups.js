document.querySelectorAll('[data-plugin-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-plugin-filter]')
      .forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.pluginFilter;
    document
      .querySelectorAll('[data-kind]')
      .forEach((item) =>
        item.classList.toggle('hidden', filter !== 'all' && item.dataset.kind !== filter)
      );
  });
});
