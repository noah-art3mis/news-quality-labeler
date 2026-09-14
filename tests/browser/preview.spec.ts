import { test, expect } from '@playwright/test';

test('inspect a post, read ratings and attribution, then recover from unavailable and link-free posts', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Bluesky post URL').fill('https://bsky.app/profile/reader.bsky.social/post/example');
  await page.getByRole('button', { name: 'Inspect sources' }).click();
  await expect(page.getByRole('heading', { name: 'Source assessment' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'reuters.com', exact: true })).toBeVisible();
  await expect(page.getByText('1.000', { exact: true })).toBeVisible();
  for (const category of ['Low', 'Medium', 'High']) {
    await expect(page.getByRole('article').getByText(`${category} quality news source`, { exact: true })).toBeVisible();
  }
  const labels = page.getByRole('region', { name: 'Proposed post labels', exact: true });
  await expect(labels.getByRole('listitem')).toHaveText([
    'Low quality news source', 'Medium quality news source', 'High quality news source',
  ]);
  await expect(labels.getByText(/Nothing has been published to Bluesky/)).toBeVisible();
  await expect(page.getByText(/Provisional project policy/).first()).toBeVisible();
  const medium = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'example.org/news', exact: true }) });
  await medium.getByText('Exact score', { exact: true }).click();
  await expect(medium.getByRole('paragraph').filter({ hasText: /^0\.65$/ })).toBeVisible();
  await expect(page.getByText('Not in dataset', { exact: true })).toBeVisible();
  await expect(page.getByText('Could not resolve destination', { exact: true })).toBeVisible();
  await expect(page.getByText('Source from quoted post', { exact: true })).toBeVisible();
  await expect(page.getByText('Further quoted posts have not been inspected.')).toBeVisible();
  await page.getByText('About these ratings', { exact: true }).click();
  await expect(page.getByRole('link', { name: /High level of correspondence/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Snapshot aaaa/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Inspect sources' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByLabel('Bluesky post URL').fill('https://bsky.app/profile/reader.bsky.social/post/missing');
  await page.getByRole('button', { name: 'Inspect sources' }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable publicly');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByLabel('Bluesky post URL').fill('https://bsky.app/profile/reader.bsky.social/post/empty');
  await page.getByRole('button', { name: 'Inspect sources' }).click();
  await expect(page.getByText('No source links found in the inspected posts.')).toBeVisible();
  await expect(labels.getByText('No labels proposed: no rated sources were found.')).toBeVisible();
  expect(errors).toEqual([]);
});
