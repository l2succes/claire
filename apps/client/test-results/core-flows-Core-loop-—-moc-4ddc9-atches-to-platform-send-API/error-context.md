# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-flows.spec.mjs >> Core loop — mock backend >> send path: text message dispatches to platform send API
- Location: e2e/core-flows.spec.mjs:693:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Test media send path')
Expected: visible
Error: strict mode violation: getByText('Test media send path') resolved to 3 elements:
    1) <div dir="auto" class="css-text-146c3p1 r-WebkitBoxOrient-8akbws r-display-krxsd3 r-maxWidth-dnmrzs r-overflow-1qsk4np r-textOverflow-1udbk01">Test media send path</div> aka getByTestId('inbox-highlight-optimistic-1788541808594').getByText('Test media send path')
    2) <div dir="auto" class="css-text-146c3p1 r-maxWidth-dnmrzs r-overflow-1udh08x r-textOverflow-1udbk01 r-whiteSpace-3s2u2q r-wordWrap-1iln25a r-userSelect-1xnzce8">Test media send path</div> aka getByTestId('message-card-optimistic-1788541808594').getByText('Test media send path')
    3) <div dir="auto" class="css-text-146c3p1">Test media send path</div> aka getByRole('button', { name: 'Test media send path 11:10 AM' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Test media send path')

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e14]:
    - generic [ref=f1e15]:
      - button "Back" [ref=f1e16] [cursor=pointer]
      - generic [ref=f1e20]: A(
      - generic [ref=f1e23]:
        - generic [ref=f1e24]: Alice (WA)
        - generic [ref=f1e25]: WhatsApp
      - button "Conversation settings" [ref=f1e30] [cursor=pointer]
    - generic [ref=f1e37]:
      - generic [ref=f1e38] [cursor=pointer]:
        - generic [ref=f1e43]:
          - generic [ref=f1e44]: OPEN LOOP
          - generic [ref=f1e45]: Send Alice the report
        - generic [ref=f1e46]: View
      - generic [ref=f1e48]:
        - button "Test media send path 11:10 AM" [ref=f1e51] [cursor=pointer]:
          - generic [ref=f1e52]:
            - generic [ref=f1e53]: Test media send path
            - generic [ref=f1e54]: 11:10 AM
        - button "Open report.pdf 10:16 AM" [ref=f1e57] [cursor=pointer]:
          - generic [ref=f1e58]:
            - button "Open report.pdf" [ref=f1e59]:
              - generic [ref=f1e64]:
                - generic [ref=f1e65]: report.pdf
                - generic [ref=f1e66]: Tap to open
            - generic [ref=f1e67]: 10:16 AM
        - button "Play video Short clip 10:15 AM" [ref=f1e70] [cursor=pointer]:
          - generic [ref=f1e71]:
            - generic [ref=f1e72]:
              - button "Play video" [ref=f1e73]
              - generic [ref=f1e77]: Short clip
            - generic [ref=f1e78]: 10:15 AM
        - generic [ref=f1e82] [cursor=pointer]:
          - generic [ref=f1e83]:
            - button "Play voice message" [ref=f1e84]
            - generic [ref=f1e87]:
              - generic "Voice note waveform, 0 percent played" [ref=f1e88]
              - generic [ref=f1e131]: 0:00
          - generic [ref=f1e132]: 10:13 AM
        - button "Check out this photo 10:11 AM" [ref=f1e135] [cursor=pointer]:
          - generic [ref=f1e136]:
            - generic [ref=f1e137]: Check out this photo
            - generic [ref=f1e142]: 10:11 AM
        - button "Thanks for letting me know 10:10 AM" [ref=f1e145] [cursor=pointer]:
          - generic [ref=f1e146]:
            - generic [ref=f1e147]: Thanks for letting me know
            - generic [ref=f1e148]: 10:10 AM
        - button "Hi! I'll send you the report by Friday 10:08 AM" [ref=f1e151] [cursor=pointer]:
          - generic [ref=f1e152]:
            - generic [ref=f1e153]: Hi! I'll send you the report by Friday
            - generic [ref=f1e154]: 10:08 AM
      - generic [ref=f1e157]:
        - button "Chat actions" [ref=f1e158] [cursor=pointer]
        - textbox "Write a message…" [ref=f1e161]
        - button "Hold to record a voice note" [ref=f1e162] [cursor=pointer]
        - button "Send message" [disabled]
    - generic [ref=f1e168]:
      - button "Bottom sheet backdrop"
    - generic [ref=f1e169]:
      - slider "Bottom Sheet"
      - slider "Bottom Sheet" [ref=f1e171]:
        - generic [ref=f1e172]:
          - generic [ref=f1e173]:
            - generic [ref=f1e174]: MESSAGE ACTIONS
            - button "Close message actions" [ref=f1e175] [cursor=pointer]
          - generic [ref=f1e179]:
            - button "Copy message" [disabled]:
              - generic [ref=f1e183]: Copy
      - slider "Bottom sheet handle" [ref=f1e186] [cursor=pointer]
  - button "5 <button> cannot contain a nested <button" [ref=f1e189] [cursor=pointer]:
    - generic [ref=f1e190]: "5"
    - generic [ref=f1e192]: <button> cannot contain a nested <button
    - button [ref=f1e193]
```

# Test source

```ts
  623 |     // Tray itself should also disappear when no cards remain
  624 |     await expect(page.getByTestId('smart-card-tray')).not.toBeVisible({ timeout: 3_000 });
  625 |   });
  626 |
  627 |   // 12. Morning Brief — brief text renders from fixture endpoint (#32)
  628 |   test('morning brief renders from /ai/morning-brief fixture', async ({ page }) => {
  629 |     await signIn(page);
  630 |
  631 |     // Morning brief container should appear (fed by the mocked /ai/morning-brief endpoint)
  632 |     await expect(page.getByTestId('morning-brief-container')).toBeVisible({ timeout: 10_000 });
  633 |
  634 |     // The fixture brief text should be visible
  635 |     await expect(
  636 |       page.getByText('2 messages need your attention')
  637 |     ).toBeVisible({ timeout: 8_000 });
  638 |   });
  639 |
  640 |   // 12b. Urgent card — renders from morning brief fixture (#32)
  641 |   test('urgent card renders for the fixture urgent message', async ({ page }) => {
  642 |     await signIn(page);
  643 |
  644 |     // The urgent cards container should be visible
  645 |     await expect(page.getByTestId('urgent-cards-container')).toBeVisible({ timeout: 10_000 });
  646 |
  647 |     // Alice (WA) urgent card should be rendered (first urgent message in fixture)
  648 |     // Scope within the container to avoid ambiguity with inbox card rows
  649 |     await expect(
  650 |       page.getByTestId('urgent-cards-container').getByText('Alice (WA)')
  651 |     ).toBeVisible({ timeout: 8_000 });
  652 |   });
  653 |
  654 |   // 13. Media in — incoming image fixture renders in chat (#35)
  655 |   test('incoming image message renders in chat', async ({ page }) => {
  656 |     await signIn(page);
  657 |
  658 |     await expect(
  659 |       page.locator('[data-testid^="message-card-"]').first()
  660 |     ).toBeVisible({ timeout: 8_000 });
  661 |     await page.locator('[data-testid^="message-card-"]').first().click();
  662 |
  663 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  664 |     await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });
  665 |
  666 |     // The image fixture message should render (testID added in this ticket)
  667 |     const image = page.getByTestId('media-image-img-chatmsg-img').locator('img');
  668 |     await expect(image).toBeVisible({ timeout: 8_000 });
  669 |     await expect(image).toHaveJSProperty('naturalWidth', 1);
  670 |   });
  671 |
  672 |   // 13b. Media in — audio, video, and document fixtures render in chat (#35)
  673 |   test('incoming audio, video, and document messages render in chat', async ({ page }) => {
  674 |     await signIn(page);
  675 |
  676 |     await expect(
  677 |       page.locator('[data-testid^="message-card-"]').first()
  678 |     ).toBeVisible({ timeout: 8_000 });
  679 |     await page.locator('[data-testid^="message-card-"]').first().click();
  680 |
  681 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  682 |     await expect(page.getByTestId('chat-message-list')).toBeVisible({ timeout: 8_000 });
  683 |
  684 |     // Audio fixture
  685 |     await expect(page.getByTestId('media-audio-chatmsg-audio')).toBeVisible({ timeout: 8_000 });
  686 |     // Video fixture
  687 |     await expect(page.getByTestId('media-video-chatmsg-video')).toBeVisible({ timeout: 8_000 });
  688 |     // Document fixture
  689 |     await expect(page.getByTestId('media-document-chatmsg-doc')).toBeVisible({ timeout: 8_000 });
  690 |   });
  691 |
  692 |   // 13c. Media send path — send button dispatches to platform API (#35)
  693 |   test('send path: text message dispatches to platform send API', async ({ page }) => {
  694 |     await signIn(page);
  695 |
  696 |     const sessionsResponsePromise = page.waitForResponse('**/platforms/**', { timeout: 10_000 }).catch(() => null);
  697 |
  698 |     await expect(
  699 |       page.locator('[data-testid^="message-card-"]').first()
  700 |     ).toBeVisible({ timeout: 8_000 });
  701 |
  702 |     await sessionsResponsePromise;
  703 |     await page.locator('[data-testid^="message-card-"]').first().click();
  704 |
  705 |     await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  706 |     await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 8_000 });
  707 |
  708 |     // Intercept the send API call
  709 |     const sendRequestPromise = page.waitForRequest(
  710 |       (req) => req.url().includes('/send') && req.method() === 'POST',
  711 |       { timeout: 8_000 }
  712 |     );
  713 |
  714 |     await page.getByTestId('chat-input').fill('Test media send path');
  715 |     await page.getByTestId('chat-send-button').click();
  716 |
  717 |     // Verify the send API was called
  718 |     const sendReq = await sendRequestPromise;
  719 |     expect(sendReq).toBeTruthy();
  720 |
  721 |     // Input should be cleared after send
  722 |     await expect(page.getByTestId('chat-input')).toHaveValue('', { timeout: 5_000 });
> 723 |     await expect(page.getByText('Test media send path')).toBeVisible({ timeout: 5_000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  724 |   });
  725 |
  726 |   // 14. Snooze — long-pressing a message card opens the snooze modal (#38)
  727 |   test('long-pressing a message card opens the snooze picker', async ({ page }) => {
  728 |     await signIn(page);
  729 |
  730 |     await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
  731 |     await expect(
  732 |       page.locator('[data-testid^="message-card-"]').first()
  733 |     ).toBeVisible({ timeout: 8_000 });
  734 |
  735 |     // Long-press to trigger onLongPress (Playwright click with delay triggers long-press)
  736 |     await page.locator('[data-testid^="message-card-"]').first().click({ delay: 600 });
  737 |
  738 |     // Snooze modal should appear
  739 |     await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });
  740 |
  741 |     // Snooze options should be present
  742 |     await expect(page.getByTestId('snooze-option-3h')).toBeVisible();
  743 |     await expect(page.getByTestId('snooze-option-tomorrow')).toBeVisible();
  744 |   });
  745 |
  746 |   // 14b. Snooze — selecting an option hides the message from inbox (#38)
  747 |   test('snoozing a message hides it from the inbox', async ({ page }) => {
  748 |     await signIn(page);
  749 |
  750 |     await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
  751 |     await expect(
  752 |       page.locator('[data-testid^="message-card-"]').first()
  753 |     ).toBeVisible({ timeout: 8_000 });
  754 |
  755 |     // Get the ID of the first card so we can check it disappears
  756 |     const firstCard = page.locator('[data-testid^="message-card-"]').first();
  757 |     const firstCardTestId = await firstCard.getAttribute('data-testid');
  758 |
  759 |     // Long-press to open snooze modal
  760 |     await firstCard.click({ delay: 600 });
  761 |     await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });
  762 |
  763 |     // Tap "Later today (3 hours)" option
  764 |     await page.getByTestId('snooze-option-3h').click();
  765 |
  766 |     // Modal should close
  767 |     await expect(page.getByTestId('snooze-modal-overlay')).not.toBeVisible({ timeout: 3_000 });
  768 |
  769 |     // The snoozed card should be removed from the inbox (optimistic hide)
  770 |     if (firstCardTestId) {
  771 |       await expect(page.getByTestId(firstCardTestId)).not.toBeVisible({ timeout: 3_000 });
  772 |     }
  773 |   });
  774 |
  775 |   // 14c. Snooze — cancelling dismisses the modal without snoozing (#38)
  776 |   test('cancelling the snooze modal keeps the message in inbox', async ({ page }) => {
  777 |     await signIn(page);
  778 |
  779 |     await expect(page.getByTestId('messages-screen')).toBeVisible({ timeout: 10_000 });
  780 |     await expect(
  781 |       page.locator('[data-testid^="message-card-"]').first()
  782 |     ).toBeVisible({ timeout: 8_000 });
  783 |
  784 |     const firstCard = page.locator('[data-testid^="message-card-"]').first();
  785 |     const firstCardTestId = await firstCard.getAttribute('data-testid');
  786 |
  787 |     // Long-press to open snooze modal
  788 |     await firstCard.click({ delay: 600 });
  789 |     await expect(page.getByTestId('snooze-modal-overlay')).toBeVisible({ timeout: 5_000 });
  790 |
  791 |     // Tap Cancel
  792 |     await page.getByTestId('snooze-cancel').click();
  793 |
  794 |     // Modal should close
  795 |     await expect(page.getByTestId('snooze-modal-overlay')).not.toBeVisible({ timeout: 3_000 });
  796 |
  797 |     // The card should still be in the inbox (not snoozed)
  798 |     if (firstCardTestId) {
  799 |       await expect(page.getByTestId(firstCardTestId)).toBeVisible({ timeout: 3_000 });
  800 |     }
  801 |   });
  802 |
  803 |   // 15. Group-chat summary — banner renders and shows summary text after expand (#41)
  804 |   test('group chat summary banner renders and shows summary on expand', async ({ page }) => {
  805 |     // Override the messages endpoint to return a group message as the first inbox entry
  806 |     await page.route('**/rest/v1/**', async (route) => {
  807 |       const url = route.request().url();
  808 |       if (url.includes('/messages')) {
  809 |         if (url.includes('chat_id=eq.')) {
  810 |           await route.fulfill({
  811 |             status: 200,
  812 |             contentType: 'application/json',
  813 |             body: JSON.stringify([
  814 |               {
  815 |                 id: 'gchatmsg-1',
  816 |                 content: 'Hey team, meeting at 3pm!',
  817 |                 timestamp: new Date(Date.now() - 1800_000).toISOString(),
  818 |                 from_me: false,
  819 |                 contact_name: 'Alice',
  820 |                 contact_phone: null,
  821 |                 content_type: 'text',
  822 |               },
  823 |             ]),
```