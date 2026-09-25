const scenes = {
  flowers: {
    counter: 'SCENE 01 / 04',
    duration: '00:00 — 00:10',
    kicker: 'THE OPEN LOOP',
    title: 'Forgot to buy your girlfriend flowers?',
    body: 'Not because it didn’t matter. Because the reminder lived in a message from three days ago, buried below everything else.',
    line: '“It’s not that you don’t care.”',
    visual: '',
    phoneContext: 'Friday',
    phoneTitle: 'It’s our anniversary.',
    phoneNotice: 'Read 2h ago',
    caption: 'The moment you remember,<br />a little too late.',
  },
  dinner: {
    counter: 'SCENE 02 / 04',
    duration: '00:10 — 00:20',
    kicker: 'THE OPEN LOOP',
    title: 'Forgot to make dinner reservations?',
    body: 'The friends group went quiet. The restaurant was full. And somehow you were the person who was supposed to book it.',
    line: '“Your friends do not hate you. Yet.”',
    visual: 'is-dinner',
    phoneContext: 'Friends group',
    phoneTitle: 'Should we book it this time?',
    phoneNotice: '8 unread messages',
    caption: 'A table for eight.<br />Nowhere to sit.',
  },
  client: {
    counter: 'SCENE 03 / 04',
    duration: '00:20 — 00:30',
    kicker: 'THE OPEN LOOP',
    title: 'Forgot to follow up with the client?',
    body: 'The six-figure deal got buried under every other thread.',
    line: '“Some loops cost more than others.”',
    visual: 'is-client',
    phoneContext: 'David · proposal',
    phoneTitle: 'Just circling back on the $180K proposal.',
    phoneNotice: 'Sent 3 days ago',
    caption: 'The thread you meant<br />to come back to.',
  },
  claire: {
    counter: 'SCENE 04 / 04',
    duration: '00:30 — 01:00',
    kicker: 'THE CLOSE',
    title: 'Claire keeps the loop open—so you don’t have to.',
    body: 'It finds the commitments, questions, and next steps inside your conversations, then puts them somewhere calm and clear.',
    line: '“Close your loops. Keep what matters.”',
    visual: 'is-claire',
    phoneContext: 'Claire',
    phoneTitle: 'Four loops. One calm place.',
    phoneNotice: 'Everything is accounted for',
    caption: 'The things that matter,<br />kept in view.',
  },
};

const visual = document.querySelector('#scene-visual');
const fields = {
  counter: document.querySelector('#scene-counter'),
  duration: document.querySelector('#scene-duration'),
  kicker: document.querySelector('#scene-kicker'),
  title: document.querySelector('#scene-title'),
  body: document.querySelector('#scene-body'),
  line: document.querySelector('#scene-line'),
  phoneContext: document.querySelector('#scene-phone-context'),
  phoneTitle: document.querySelector('#scene-phone-title'),
  phoneNotice: document.querySelector('#scene-phone-notice'),
  caption: document.querySelector('#scene-visual-caption'),
};

document.querySelectorAll('.story-button').forEach((button) => {
  button.addEventListener('click', () => {
    const scene = scenes[button.dataset.scene];
    document.querySelectorAll('.story-button').forEach((item) => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-selected', String(item === button));
    });
    visual.className = `scene-visual ${scene.visual}`;
    fields.counter.textContent = scene.counter;
    fields.duration.textContent = scene.duration;
    fields.kicker.innerHTML = `<span></span> ${scene.kicker}`;
    fields.title.textContent = scene.title;
    fields.body.textContent = scene.body;
    fields.line.textContent = scene.line;
    fields.phoneContext.textContent = scene.phoneContext;
    fields.phoneTitle.textContent = scene.phoneTitle;
    fields.phoneNotice.textContent = scene.phoneNotice;
    fields.caption.innerHTML = scene.caption;
  });
});

const instagramAd = document.querySelector('.instagram-ad');

if (instagramAd && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  instagramAd.classList.add('has-motion');
  const instagramObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        instagramAd.classList.add('is-visible');
        instagramObserver.disconnect();
      }
    },
    { threshold: 0.35 }
  );
  instagramObserver.observe(instagramAd);
}
