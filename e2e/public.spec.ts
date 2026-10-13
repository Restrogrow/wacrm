import { expect, test } from '@playwright/test'

// Marketing site, blog and SEO basics. No sign-in or database needed.

test.describe('marketing pages', () => {
  for (const path of ['/', '/pricing', '/docs', '/about', '/contact']) {
    test(`${path} loads with a title and canonical URL`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(/Repeat ?Grow/)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /repeatgrow\.com/)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/)
    })
  }

  test('pricing shows the plans in rupees', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByText('Starter').first()).toBeVisible()
    await expect(page.getByText('₹499').first()).toBeVisible()
  })
})

test.describe('blog', () => {
  test('index lists articles and opens one', async ({ page }) => {
    await page.goto('/blog')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const href = await page.locator('a[href^="/blog/"]').first().getAttribute('href')
    expect(href).toBeTruthy()
    await page.goto(href!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible()
  })

  test('article has structured data and working images', async ({ page, request }) => {
    await page.goto('/blog/shopify-whatsapp-order-notifications')
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
    const types = schemas.map((s) => JSON.parse(s)['@type'])
    expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'BlogPosting', 'FAQPage']))

    const cover = await page.locator('article img').first().getAttribute('src')
    expect(cover).toBeTruthy()
    expect((await request.get(cover!)).status()).toBe(200)

    const og = await request.get('/blog/shopify-whatsapp-order-notifications/opengraph-image')
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')
  })
})

test.describe('SEO files', () => {
  test('robots.txt allows the site and blocks the app', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text()
    expect(body).toContain('Allow: /')
    expect(body).toContain('Disallow: /inbox')
    expect(body).toContain('Sitemap:')
  })

  test('sitemap lists pricing and blog posts', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text()
    expect(body).toContain('/pricing</loc>')
    expect(body).toContain('/blog/shopify-whatsapp-order-notifications</loc>')
  })
})
