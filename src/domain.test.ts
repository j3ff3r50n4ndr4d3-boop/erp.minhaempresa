import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, modules, resourceMap, REFERENCE_DATE } from './data';
import { chartSeries, getAlerts, localAnswer, metricsFor, normalizeRow, parseOFX, periodBounds, priceSimulation, validateBackup } from './domain';

test('catálogo cobre os 12 módulos e referencia apenas recursos existentes', () => {
  assert.equal(modules.length, 12);
  for (const module of modules) for (const tab of module.tabs) for (const id of tab.resources || []) {
    assert(resourceMap[id], `recurso ausente: ${id}`);
    assert(resourceMap[id].module === module.id || (module.id === 'purchases' && id === 'payables'), `recurso compartilhado inesperado: ${id}`);
  }
  const data = createInitialData();
  for (const [id, rows] of Object.entries(data.rows)) {
    const ids = new Set(rows.map(r => r.id));
    assert.equal(ids.size, rows.length, `ids duplicados em ${id}`);
  }
  assert(data.rows.productionOrders.every(r => Number.isFinite(Number(r.quantity))));
});

test('backup financeiro original é preservado na base demonstrativa', () => {
  const data = createInitialData();
  assert.equal(data.rows.bankAccounts.length, 3);
  assert.equal(data.rows.payables.length, 17);
  assert.equal(data.rows.receivables.length, 13);
  assert.equal(data.rows.bankAccounts.find(a => a.name === 'Banco Inter')?.balance, 18540.75);
  assert(data.rows.payables.some(r => r.name === 'DAS — Simples Nacional' && r.value === 2140.33));
});

test('períodos usam a data de referência demonstrativa', () => {
  assert.equal(periodBounds('today').start, REFERENCE_DATE);
  assert.equal(periodBounds('month').start, '2026-11-01');
  assert.equal(periodBounds('six').start, '2026-06-01');
  assert.equal(periodBounds('year').start, '2026-01-01');
});

test('métricas executivas derivam dos pedidos e despesas', () => {
  const data = createInitialData(); const b = periodBounds('month'); const m = metricsFor(data, b.start, b.end);
  const expected = data.rows.salesOrders.filter(r => String(r.date).startsWith('2026-11') && r.status !== 'Cancelado').reduce((s, r) => s + Number(r.value), 0);
  assert.equal(m.revenue, expected);
  assert.equal(m.grossProfit, m.revenue - m.directCosts);
  assert(Math.abs(m.netProfit - (m.grossProfit - m.operatingExpenses - m.revenue * 0.06)) < 0.001);
  assert(m.contributionMargin > 0 && m.contributionMargin < 100);
  assert.equal(chartSeries(data, b.start, b.end).length, 6);
});

test('OFX interpreta SGML e XML, ignora FITID duplicado e rejeita arquivo inválido', () => {
  const sgml = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106120000<TRNAMT>1234.56<FITID>a1<MEMO>Venda teste</STMTTRN><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-90,10<FITID>a2<MEMO>Compra</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>1234.56<FITID>a1<MEMO>Duplicado</STMTTRN></BANKTRANLIST></OFX>`;
  const entries = parseOFX(sgml);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].amount, 1234.56);
  assert.equal(entries[1].amount, -90.1);
  assert.equal(entries[0].date, '2026-11-06');
  assert.equal(parseOFX(`<OFX><STMTTRN><DTPOSTED>20261106</DTPOSTED><TRNAMT>10.00</TRNAMT><FITID>x</FITID></STMTTRN></OFX>`).length, 1);
  assert.throws(() => parseOFX('não é ofx'), /OFX/);
  assert.throws(() => parseOFX('<OFX><STMTTRN><DTPOSTED>invalido</DTPOSTED><TRNAMT>10</TRNAMT></STMTTRN></OFX>'), /Nenhuma transação/);
});

test('precificação por markup divisor e desconto', () => {
  const result = priceSimulation({ cost: 100, expenses: 12, tax: 6, commission: 5, margin: 25, discount: 0 });
  assert(Math.abs(result.price - 192.3076923) < 0.0001);
  assert(Math.abs(result.margin - 25) < 0.0001);
  const discounted = priceSimulation({ cost: 100, expenses: 12, tax: 6, commission: 5, margin: 25, discount: 10 });
  assert(discounted.salePrice < result.price);
  assert(discounted.margin < 25);
  assert.throws(() => priceSimulation({ cost: 100, expenses: 50, tax: 30, commission: 15, margin: 10, discount: 0 }), /menor que 100/);
  assert.throws(() => priceSimulation({ cost: 100, expenses: 0, tax: 0, commission: 0, margin: 0, discount: 100 }), /desconto/);
});

test('normalização mantém campos calculados consistentes', () => {
  assert.equal(normalizeRow('rawMaterials', { id: 'x', name: 'Item', quantity: 10, cost: 2.5 }).total, 25);
  assert.equal(normalizeRow('payroll', { id: 'x', name: 'Folha', gross: 1000, deductions: 100 }).value, 900);
  assert.equal(normalizeRow('salesGoals', { id: 'x', name: 'Meta', target: 200, achieved: 50 }).progress, 25);
  const sheet = normalizeRow('costSheets', { id: 'x', name: 'Produto', materials: 50, labor: 20, overhead: 10, price: 100 });
  assert.equal(sheet.total, 80); assert.equal(sheet.margin, 20);
});

test('backup valida estrutura, números e ids antes de restaurar', () => {
  const data = createInitialData();
  assert.equal(validateBackup(JSON.parse(JSON.stringify(data))).rows.payables.length, 17);
  assert.throws(() => validateBackup({ version: 2 }), /incompatível/);
  const broken = structuredClone(data); broken.rows.payables[0].value = 'abc' as unknown as number;
  assert.throws(() => validateBackup(broken), /numérico/);
  const duplicate = structuredClone(data); duplicate.rows.payables[1].id = duplicate.rows.payables[0].id;
  assert.throws(() => validateBackup(duplicate), /Registro inválido/);
});

test('alertas e análise local usam dados do workspace', () => {
  const data = createInitialData();
  assert.equal(getAlerts(data).length, 4);
  const answer = localAnswer('Como está meu financeiro?', data);
  assert(answer.includes('saldo bancário'));
  assert(!/[\u4e00-\u9fff]/.test(answer));
});
