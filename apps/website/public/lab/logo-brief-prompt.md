# Claire — logo generation prompt

Copy the block below into ChatGPT, Gemini, Claude, or any reasoning model.
Image-model variants follow at the bottom.

---

## MASTER PROMPT (paste from here)

You are a brand identity designer with a track record of marks that survive
20 years — think Michael Bierut, Paula Scher, or the team behind the Airbnb
Bélo. I need logo concepts for a product called **Claire**, and I need you to
be genuinely inventive, not safe.

### The product

Claire is an AI-native multi-chat client. It brings WhatsApp, Telegram,
Instagram, iMessage, and more into a single inbox, and layers an AI assistant
over all of it. The AI can search every conversation you've ever had, knows
your relationships, and tracks what you promised people. Tagline: "All your
chats. One AI."

The real differentiator is **not** "another messaging app." It's that Claire
gives you *clarity over a mess you already have*. Many fragmented channels in,
one clear understanding out. It remembers so you don't have to.

### The name

"Claire" comes from Latin *clarus* — clear, bright, luminous, legible.
This is the richest and least obvious seam in the brand. Clarity, light,
focus, resolution, transparency, the moment something becomes legible.

### What already exists — and why it's failing

I have 15 SVG marks. All 15 are the same concept: a rounded speech bubble
containing an open letter C. Three "rounds" of exploration produced only
stroke-weight and terminal-cut variations, never a second idea. Specific
failures:

1. **Monoculture.** Fifteen files, one concept. No divergence.
2. **The C doesn't read as a letter.** It's drawn as an open arc with round
   caps terminating around 45° and 135°. At 24px it reads as a loading
   spinner or a partial ring, not a C.
3. **Category sameness.** Rounded speech bubble + bright green is the most
   occupied space in messaging — WhatsApp, Messenger, Signal, Telegram all
   live there. The mark is indistinguishable in a folder of chat apps.
4. **Nothing says "many become one."** The convergence idea — the actual
   product — appears in exactly one mark, and only as two overlapping bubbles.
5. **Nothing says memory or promise-tracking**, which is the feature people
   would actually miss.
6. **AI is expressed as a four-point sparkle.** This is the single most
   exhausted cliché in software branding right now.
7. **The name is completely unused.** Zero marks explore clarity or light.

### Your task

Give me **eight distinct concept territories** — genuinely distinct, meaning
if I removed the name, no two would be mistaken for each other. Do not give me
eight variations of one thing. Deliberately include at least:

- One that abandons the speech bubble entirely
- One that abandons the letter C entirely
- One built on *clarity/light/optics* rather than chat (lens, focus, prism,
  refraction, legibility, resolution, the moment blur becomes sharp)
- One built on *convergence* — many streams resolving into one
- One built on *memory or continuity* — the thread that persists
- One purely typographic or monogram-based, no pictorial container
- One that would work as an animated app icon or loading state
- One deliberately strange — something that would make a design director
  either love it or hate it, with no middle ground

For **each** territory, give me:

- **Name** of the direction (2–3 words)
- **The idea in one sentence** — what a person would say it means
- **Construction**, precise enough to draw: shapes, geometry, counters,
  stroke behavior, what's positive vs negative space, where the weight sits
- **Why it's ownable** — what specifically stops a competitor from doing it
- **24px test** — what survives when it's tiny, and what you'd drop
- **Failure mode** — the honest reason this one might not work
- **Animation potential** — if it moves, what moves

Then:

- Rank all eight by **distinctiveness** and separately by **durability**
  (will it look dated in five years?). Where the two rankings disagree, say so
  and explain the tradeoff.
- Name the single strongest and defend it in one paragraph against the
  strongest objection to it.
- Flag any territory that dangerously resembles an existing well-known mark.

### Constraints

- Must work as a monochrome 1-color version. Test every idea in pure black
  on white before you consider color.
- Must be legible at 20×20px in a browser tab and in a crowded iOS folder.
- Must not depend on gradients, glows, or soft shadows to read.
- Buildable in clean vector geometry — circles, arcs, straight lines, simple
  curves. If it needs 200 anchor points, it's wrong.
- Existing palette, which you may use, extend, or argue I should replace:
  ink `#10120F`, lime `#DFFF64`, paper `#FFFDF8`, cream `#F4F1EA`,
  sky `#B9DCFF`, coral `#FF745F`, lavender `#D8CCFF`, blush `#F2CFE1`.
  If you think lime is a mistake because of its proximity to WhatsApp and
  Signal green, say so directly and propose an alternative.

### Rules of engagement

- Do not use a four-point sparkle, a glowing orb, a neural-network node
  diagram, a chat bubble with a face, or a gradient blob. These are banned.
- Do not hedge. If an idea is weak, say it's weak.
- Do not give me eight safe options. At least three should genuinely risk
  failure.
- Describe geometry precisely enough that I could hand your description to
  an illustrator and get back what you imagined.

If you can output SVG, give me clean, hand-written SVG for your top three on
a 64×64 viewBox — real geometry, not traced approximations.

## (paste to here)

---

## Follow-up prompts

Use these after the first response, in order. They're where the quality
actually comes from — the first response is raw material.

**1. Force divergence.** If the eight territories still feel related:

> Territories 2, 4, and 7 are closer to each other than you think — they all
> resolve to a circular container. Replace them with three that share no
> geometric DNA with the rest.

**2. Push the winner.** Pick your favorite, then:

> Take direction [NAME] and give me six sub-variations that explore its full
> range: the most reduced version possible, the most expressive, the most
> geometric, the most humanist, one that works as a repeating pattern, and
> one built specifically as a dark-mode app icon. For each, tell me what is
> gained and what is lost.

**3. Adversarial.** This one is worth running on a *different* model than the
one that generated the concepts:

> Here are eight logo concepts for an AI multi-chat client. Argue against each
> one as harshly as you can. Which have been done before? Which will look
> dated by 2030? Which fail at 20px? Which would a trademark search kill?
> Be specific and name real existing marks where you see collision.

**4. Lockup.** Once a mark is chosen:

> Design the wordmark to pair with this symbol. Claire is lowercase in the
> current brand. Recommend a typeface (with a free/open alternative),
> letterspacing, the symbol-to-wordmark size relationship, clear space, and
> show me horizontal and stacked lockups described precisely.

---

## Image-model variants

These generate *look*, not *systems* — use them for mood after the concept is
chosen, not to pick the concept.

**Midjourney / Ideogram**

```
minimal vector logo for "Claire", an AI messaging app that unifies many chat
networks into one clear view, concept: [INSERT ONE TERRITORY HERE], flat
two-color design, black and off-white, geometric construction, thick confident
strokes, no gradient, no glow, no sparkle, legible at small size, brand
identity presentation on neutral background --style raw --v 6
```

**DALL·E / GPT image / Gemini**

```
A minimal, flat, two-color vector logo mark on a plain off-white background.
Concept: [INSERT ONE TERRITORY HERE]. Pure geometric construction with thick
even strokes in near-black. No gradients, no glows, no sparkles, no text, no
3D, no drop shadows. Single centered mark, generous margins, the kind of
reduction you'd see in a professional brand guidelines document.
```

**Note on image models:** they cannot do precise geometry and will not give
you a production mark. Use the reasoning-model output as the source of truth
and have the final chosen direction drawn as real SVG.

---

## Suggested workflow

1. Run the master prompt on **three** different models — they diverge
   meaningfully on a task like this.
2. Pool everything. Discard anything that is a bubble containing a C.
3. Run follow-up **3** (adversarial) on the pooled survivors, using a
   different model than generated them.
4. Take the 2–3 that survive into follow-up **2** for depth.
5. Only then draw real SVG, and test at 20px before falling in love.
