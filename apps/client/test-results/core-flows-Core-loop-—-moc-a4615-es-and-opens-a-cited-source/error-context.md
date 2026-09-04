# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-flows.spec.mjs >> Core loop — mock backend >> global Ask Claire searches messages and opens a cited source
- Location: e2e/core-flows.spec.mjs:315:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('open-ask-claire')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for getByTestId('open-ask-claire')

```

```yaml
- text: Inbox
- button "Search everything":
  - img
- button "New message":
  - img
- img
- textbox "Search conversations"
- button "All"
- button "Unread 3"
- button "Needs reply"
- button "WhatsApp":
  - img
  - text: WhatsApp
- text: Highlights Claire's picks
- button "Alice (WA). Open loop":
  - img
  - text: CLAIRE'S PICK
  - img
  - text: Alice (WA) I'll send you the report by Friday Open loop 8:11 PM
- button "Bob (TG). 1 unread":
  - img
  - text: CLAIRE'S PICK
  - img
  - text: Bob (TG) Hey, when can we meet? 1 unread 7:11 PM
- button "Carol (IG). 1 unread":
  - img
  - text: CLAIRE'S PICK
  - img
  - text: Carol (IG) Let's catch up soon! 1 unread 5:11 PM
- text: Recent 3 conversations
- button "Alice (WA), 1 unread":
  - text: A(
  - img
  - text: Alice (WA) 8:11 PM I'll send you the report by Friday
  - img
  - text: "1"
- button "Bob (TG), 1 unread":
  - text: B(
  - img
  - text: Bob (TG) 7:11 PM Hey, when can we meet? 1
- button "Carol (IG), 1 unread":
  - text: C(
  - img
  - text: Carol (IG) 5:11 PM Let's catch up soon! 1
- button "New message":
  - img
- button "Home":
  - img
- button "Inbox":
  - img
- button "Ask Claire":
  - img
- button "Loops":
  - img
- button "More":
  - img
- button "Bottom sheet backdrop"
- slider "Bottom Sheet"
- slider "Bottom Sheet":
  - text: More
  - button "Close":
    - img
  - button "Search. Messages, people, files, and loops":
    - img
    - text: Search Messages, people, files, and loops
    - img
  - button "People. Contacts and relationship context":
    - img
    - text: People Contacts and relationship context
    - img
  - button "Connections. Messaging accounts and setup":
    - img
    - text: Connections Messaging accounts and setup
    - img
  - button "Settings. Notifications, AI, and account controls":
    - img
    - text: Settings Notifications, AI, and account controls
    - img
- slider "Bottom sheet handle"
- 'button "3 React does not recognize the `accessibil"':
  - text: "3 React does not recognize the `accessibil"
  - button:
    - img
```

# Test source

```ts
  217 |   test('editing suggestion text fires feedback with customResponse', async ({ page }) => {
  218 |     await signIn(page);
  219 | 
  220 |     await expect(
  221 |       page.locator('[data-testid^="message-card-"]').first()
  222 |     ).toBeVisible({ timeout: 8_000 });
  223 |     await page.locator('[data-testid^="message-card-"]').first().click();
  224 | 
  225 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  226 |     await openReplyOptions(page);
  227 |     await expect(page.getByTestId('ai-suggestion-strip')).toBeVisible({ timeout: 10_000 });
  228 | 
  229 |     // Accept a suggestion (fills the composer)
  230 |     await page.getByTestId('ai-suggestion-use-0').click();
  231 | 
  232 |     // The composer should be filled with the suggestion text
  233 |     await expect(page.getByTestId('chat-input')).toHaveValue(
  234 |       'Sounds great, looking forward to it!',
  235 |       { timeout: 5_000 }
  236 |     );
  237 | 
  238 |     // Edit the composed text (simulates "edit" action)
  239 |     await page.getByTestId('chat-input').fill('Sounds great, but let me check my schedule first!');
  240 | 
  241 |     // Verify the input holds the edited value
  242 |     await expect(page.getByTestId('chat-input')).toHaveValue(
  243 |       'Sounds great, but let me check my schedule first!',
  244 |       { timeout: 3_000 }
  245 |     );
  246 |   });
  247 | 
  248 |   // 5e. Reply options prefetch — options appear without a manual draft trigger.
  249 |   test('prefetched reply options populate the composer when selected', async ({ page }) => {
  250 |     // Override ai_suggestions to return empty, so the chat prefetches a fresh
  251 |     // response from the AI endpoint on open.
  252 |     await page.route('**/rest/v1/**', async (route) => {
  253 |       const url = route.request().url();
  254 |       const method = route.request().method();
  255 |       if (url.includes('/ai_suggestions')) {
  256 |         // Return empty list for both GET and PATCH
  257 |         await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  258 |       } else if (url.includes('/messages')) {
  259 |         if (url.includes('chat_id=eq.')) {
  260 |           await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CHAT_MESSAGES) });
  261 |         } else {
  262 |           await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INBOX_MESSAGES) });
  263 |         }
  264 |       } else if (url.includes('/chats')) {
  265 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chatsPayload(url, route.request().headers())) });
  266 |       } else if (url.includes('/platform_sessions')) {
  267 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PLATFORM_SESSIONS) });
  268 |       } else if (url.includes('/smart_cards')) {
  269 |         if (method === 'PATCH') {
  270 |           await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  271 |         } else {
  272 |           await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  273 |         }
  274 |       } else if (url.includes('/contact_profiles')) {
  275 |         await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
  276 |       } else {
  277 |         await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  278 |       }
  279 |     });
  280 | 
  281 |     await signIn(page);
  282 | 
  283 |     await expect(
  284 |       page.locator('[data-testid^="message-card-"]').first()
  285 |     ).toBeVisible({ timeout: 8_000 });
  286 |     await page.locator('[data-testid^="message-card-"]').first().click();
  287 | 
  288 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  289 |     await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });
  290 |     await openReplyOptions(page);
  291 | 
  292 |     await expect(page.getByTestId('ai-suggestion-scroll')).toBeVisible({ timeout: 8_000 });
  293 |     await expect(page.getByTestId('draft-reply-button')).toHaveCount(0);
  294 | 
  295 |     // Selecting a prefetched option fills the composer but never sends it.
  296 |     await page.getByTestId('ai-suggestion-chip-0').click();
  297 | 
  298 |     // Composer should be filled with the first suggestion from the mock response
  299 |     await expect(page.getByTestId('chat-input')).toHaveValue(
  300 |       'Sure, I can do that!',
  301 |       { timeout: 8_000 }
  302 |     );
  303 |   });
  304 | 
  305 |   test('Ask Claire explains the conversation without sending a message', async ({ page }) => {
  306 |     await signIn(page);
  307 |     await page.locator('[data-testid^="message-card-"]').first().click();
  308 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  309 | 
  310 |     await page.getByTestId('ask-claire-button').click();
  311 |     await expect(page.getByTestId('conversation-explanation')).toContainText('Alice is confirming the report timeline.');
  312 |     await expect(page.getByTestId('chat-input')).toHaveValue('');
  313 |   });
  314 | 
  315 |   test('global Ask Claire searches messages and opens a cited source', async ({ page }) => {
  316 |     await signIn(page);
> 317 |     await expect(page.getByTestId('open-ask-claire')).toBeVisible({ timeout: 8_000 });
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  318 |     await page.getByTestId('open-ask-claire').click();
  319 | 
  320 |     await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });
  321 |     await page.getByTestId('assistant-new-thread').click();
  322 |     await page.getByTestId('assistant-input').fill('Where did I mention meeting Alice?');
  323 |     await page.getByTestId('assistant-send').click();
  324 | 
  325 |     await expect(page.getByTestId('assistant-turn-list')).toContainText('You discussed meeting Alice after the report is sent.');
  326 |     await expect(page.getByTestId('assistant-screen')).toContainText('Where did I mention meeting Alice?');
  327 |     await expect(page.getByTestId('assistant-context-tokens')).toContainText('Alice (WA)');
  328 |     await expect(page.getByTestId('assistant-sources')).toContainText("Hi! I'll send you the report by Friday");
  329 |     await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(3);
  330 |     await page.getByTestId('assistant-sources-toggle').click();
  331 |     await expect(page.locator('[data-testid^="assistant-source-"]')).toHaveCount(5);
  332 |     await page.getByTestId('assistant-context-conversation-mock-chat-wa-alice').click();
  333 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
  334 |     await expect(page).toHaveURL(/highlightMessageId=chatmsg-1/);
  335 |     await expect(page.getByTestId('message-bubble-chatmsg-1-incoming')).toHaveCSS('border-top-width', '2px');
  336 |   });
  337 | 
  338 |   test('Ask Claire @ targeting sends the selected conversation scope', async ({ page }) => {
  339 |     await signIn(page);
  340 |     await page.getByTestId('open-ask-claire').click();
  341 |     await expect(page.getByTestId('assistant-screen')).toBeVisible({ timeout: 8_000 });
  342 | 
  343 |     await page.getByTestId('assistant-input').fill('@');
  344 |     await expect(page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice')).toBeVisible({ timeout: 5_000 });
  345 |     await page.getByTestId('assistant-mention-candidate-mock-chat-wa-alice').click();
  346 |     await expect(page.getByTestId('assistant-mention-mock-chat-wa-alice')).toBeVisible();
  347 | 
  348 |     await page.getByTestId('assistant-input').fill('What did we decide?');
  349 |     await page.getByTestId('assistant-send').click();
  350 |     await expect(page.getByTestId('assistant-turn-list')).toContainText('Scoped Alice answer.');
  351 |   });
  352 | 
  353 |   // 6. Loops tab — renders the loops screen
  354 |   test('Loops tab renders the loops screen', async ({ page }) => {
  355 |     await signIn(page);
  356 | 
  357 |     // Click Loops tab
  358 |     await page.getByTestId('tab-loops').click();
  359 | 
  360 |     // Confirm the route loaded — the loops screen container is present
  361 |     await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
  362 |   });
  363 | 
  364 |   // 6b. Loops screen — seeded loop item appears in the list
  365 |   test('Loops screen shows seeded loop item', async ({ page }) => {
  366 |     await signIn(page);
  367 | 
  368 |     await page.getByTestId('tab-loops').click();
  369 |     await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
  370 | 
  371 |     // The loops list should be visible
  372 |     await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 8_000 });
  373 | 
  374 |     // The seeded loop item should appear
  375 |     await expect(
  376 |       page.locator('[data-testid^="loop-item-"]').first()
  377 |     ).toBeVisible({ timeout: 8_000 });
  378 |   });
  379 | 
  380 |   // 6c. Loops screen — tab switching works
  381 |   test('Loops screen tab switching renders correct tab', async ({ page }) => {
  382 |     await signIn(page);
  383 | 
  384 |     await page.getByTestId('tab-loops').click();
  385 |     await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
  386 | 
  387 |     // Switch to Done tab
  388 |     await page.getByTestId('loops-tab-done').click();
  389 |     // Done tab is now active — either empty state or items show
  390 |     await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });
  391 | 
  392 |     // Switch to Overdue tab
  393 |     await page.getByTestId('loops-tab-waiting').click();
  394 |     await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });
  395 | 
  396 |     // Switch back to Open
  397 |     await page.getByTestId('loops-tab-open').click();
  398 |     await expect(page.getByTestId('loops-list')).toBeVisible({ timeout: 5_000 });
  399 |   });
  400 | 
  401 |   // 6d. Loops are conversation-first: tapping a card opens its chat to reply.
  402 |   test('Loops screen opens the loop details page from a loop card', async ({ page }) => {
  403 |     await signIn(page);
  404 | 
  405 |     await page.getByTestId('tab-loops').click();
  406 |     await expect(page.getByTestId('loops-screen')).toBeVisible({ timeout: 10_000 });
  407 | 
  408 |     // Wait for the loop item to appear
  409 |     await expect(
  410 |       page.locator('[data-testid^="loop-item-"]').first()
  411 |     ).toBeVisible({ timeout: 8_000 });
  412 | 
  413 |     await expect(page.getByTestId('loop-contact-name-loop-1')).toHaveText('Alice (WA)');
  414 |     await expect(page.getByTestId('loop-contact-avatar-loop-1')).toBeVisible();
  415 | 
  416 |     // The card opens the loop, not the chat: snooze, history, and delete live
  417 |     // on the details page, and jumping to the conversation skipped all of it.
```