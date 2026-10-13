import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const base = process.env.TEST_BASE_URL || 'http://localhost:5173';
  const results = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/produto/vestido-luna-creme', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
      console.log('Product diagnostics', JSON.stringify({errors, button: await page.getByRole('button', {name: /Adicionar|Adicionado/}).allTextContents()}));
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('l7-commerce-cart') || '[]').length > 0);
      await page.goto(base + '/checkout');
      await page.getByRole('heading', { name: 'Seus dados' }).waitFor();
      await page.getByLabel('Nome completo', { exact: true }).fill('Comprador Teste');
      await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
      await page.getByLabel('Celular', { exact: true }).fill('71999999999');
      await page.getByRole('button', { name: 'Conferir dados', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Dados conferidos' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Pagamento em preparação' }).isDisabled(), true);
      await page.getByRole('radio', { name: /Motoboy/ }).check();
      await page.getByLabel('CEP', { exact: true }).fill('41710-000');
      await page.getByLabel('Rua / avenida', { exact: true }).fill('Rua de teste');
      await page.getByLabel('Número', { exact: true }).fill('1');
      await page.getByLabel('Bairro', { exact: true }).fill('Bairro de teste');
      await page.getByLabel('Cidade', { exact: true }).fill('Recife');
      await page.getByLabel('UF', { exact: true }).fill('PE');
      await page.getByRole('button', { name: 'Conferir dados', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Salvador' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      fs.mkdirSync('outputs', { recursive: true });
      await page.screenshot({ path: `outputs/checkout-${width}.png`, fullPage: true });
      const denied = await page.request.post(base + '/api/checkout/start', { data: {} });
      assert.equal(denied.status(), 503);
      const webhook = await page.request.post(base + '/api/payments/mercado-pago/webhook?data.id=1', { data: {} });
      assert.equal(webhook.status(), 503);
      await page.goto(base + '/checkout/retorno?status=success');
      await page.getByText('O retorno do Mercado Pago não confirma a aprovação.', { exact: false }).waitFor();
      assert.deepEqual(errors, []);
      results.push({ width, checkout: 'passed', blockedRealPayment: true, consoleErrors: errors });
      await context.close();
    }
    console.log(JSON.stringify(results, null, 2));
    fs.writeFileSync('outputs/commerce-browser-results.json', JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
