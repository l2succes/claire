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

document.querySelectorAll('[data-auth-send-code]').forEach((button) => {
  const form = button.closest('.auth-screen')?.querySelector('[data-email-auth-form]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    button.click();
  });

  button.addEventListener('click', () => {
    const emailInput = form?.querySelector('input[type="email"]');
    if (!emailInput?.checkValidity()) {
      emailInput?.reportValidity();
      return;
    }

    const verificationCase = document.querySelector(
      '.screen-case[data-screen="email-verification"]'
    );
    verificationCase?.querySelectorAll('[data-otp-email]').forEach((label) => {
      label.textContent = emailInput.value.trim();
    });
    verificationCase?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const verificationScreen = verificationCase?.querySelector('[data-otp-screen]');
    verificationScreen?.classList.add('code-sent');
    window.setTimeout(() => {
      verificationScreen?.classList.remove('code-sent');
      verificationCase?.querySelector('[data-otp-inputs] input')?.focus();
    }, 420);
  });
});

document.querySelectorAll('[data-otp-screen]').forEach((screen) => {
  const group = screen.querySelector('[data-otp-inputs]');
  const inputs = Array.from(group?.querySelectorAll('input') ?? []);
  const submit = screen.querySelector('[data-otp-submit]');
  const resend = screen.querySelector('[data-otp-resend]');

  const updateOtpState = () => {
    const complete = inputs.every((input) => /^\d$/.test(input.value));
    group?.classList.toggle('complete', complete);
    if (submit) submit.disabled = !complete;
  };

  const fillFrom = (startIndex, digits) => {
    digits.slice(0, inputs.length - startIndex).forEach((digit, offset) => {
      inputs[startIndex + offset].value = digit;
    });
    const nextIndex = Math.min(startIndex + digits.length, inputs.length - 1);
    inputs[nextIndex]?.focus();
    inputs[nextIndex]?.select();
    updateOtpState();
  };

  inputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      input.value = digits.slice(-1);
      if (input.value) inputs[index + 1]?.focus();
      updateOtpState();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
        inputs[index - 1].value = '';
        updateOtpState();
      }
      if (event.key === 'ArrowLeft') inputs[index - 1]?.focus();
      if (event.key === 'ArrowRight') inputs[index + 1]?.focus();
    });
    input.addEventListener('paste', (event) => {
      const digits = event.clipboardData?.getData('text').replace(/\D/g, '') ?? '';
      if (!digits) return;
      event.preventDefault();
      fillFrom(index, digits);
    });
  });

  resend?.addEventListener('click', () => {
    resend.textContent = 'Code sent again';
    resend.disabled = true;
    window.setTimeout(() => {
      resend.textContent = 'Resend code';
      resend.disabled = false;
    }, 2200);
  });

  submit?.addEventListener('click', () => {
    if (submit.disabled) return;
    submit.textContent = 'Verified ✓';
    submit.setAttribute('aria-live', 'polite');
  });

  updateOtpState();
});

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
