import type { AppData, Period, Row } from './types';
import { REFERENCE_DATE, resourceMap, modules } from './data';

export function periodBounds(period: Period, reference = REFERENCE_DATE): { start: string; end: string; previousStart: string; previousEnd: string; label: string } {
  const d = new Date(reference + 'T12:00:00Z');
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (period === 'today') { const prev = new Date(d); prev.setUTCDate(prev.getUTCDate() - 1); return { start: reference, end: reference, previousStart: iso(prev), previousEnd: iso(prev), label: 'Hoje' }; }
  if (period === 'month') return { start: iso(new Date(Date.UTC(y, m, 1))), end: reference, previousStart: iso(new Date(Date.UTC(y, m - 1, 1))), previousEnd: iso(new Date(Date.UTC(y, m - 1, d.getUTCDate()))), label: 'Este mês' };
  if (period === 'year') return { start: `${y}-01-01`, end: reference, previousStart: `${y - 1}-01-01`, previousEnd: `${y - 1}${reference.slice(4)}`, label: 'Este ano' };
  return { start: iso(new Date(Date.UTC(y, m - 5, 1))), end: reference, previousStart: iso(new Date(Date.UTC(y, m - 11, 1))), previousEnd: iso(new Date(Date.UTC(y, m - 5, d.getUTCDate()))), label: 'Últimos 6 meses' };
}
export const inRange = (date: unknown, start: string, end: string) => typeof date === 'string' && date.slice(0, 10) >= start && date.slice(0, 10) <= end;
export function metricsFor(data: AppData, start: string, end: string) {
  const sales = data.rows.salesOrders.filter(r => inRange(r.date, start, end) && r.status !== 'Cancelado');
  const revenue = sales.reduce((s, r) => s + Number(r.value || 0), 0);
  const directCosts = sales.reduce((s, r) => s + Number(r.cost || 0), 0);
  const operatingExpenses = data.rows.expenses.filter(r => inRange(r.date, start, end) && r.status !== 'Cancelado').reduce((s, r) => s + Number(r.value || 0), 0);
  const variableCosts = directCosts * 0.78;
  const taxes = revenue * 0.06;
  const grossProfit = revenue - directCosts;
  const netProfit = grossProfit - operatingExpenses - taxes;
  const contribution = revenue - variableCosts - taxes;
  return { revenue, directCosts, operatingExpenses, expenses: directCosts + operatingExpenses, grossProfit, netProfit, contribution, contributionMargin: revenue ? contribution / revenue * 100 : 0, netMargin: revenue ? netProfit / revenue * 100 : 0, orders: sales.length, averageTicket: sales.length ? revenue / sales.length : 0, taxes };
}
export function chartSeries(data: AppData, start: string, end: string) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  const monthly = days > 45;
  const points: { label: string; revenue: number; expenses: number; profit: number; key: string }[] = [];
  const cursor = new Date(start + 'T12:00:00Z');
  if (monthly) cursor.setUTCDate(1);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const key = cursor.toISOString().slice(0, monthly ? 7 : 10);
    const sales = data.rows.salesOrders.filter(r => String(r.date).startsWith(key) && inRange(r.date, start, end) && r.status !== 'Cancelado');
    const revenue = sales.reduce((s, r) => s + Number(r.value || 0), 0);
    const expenses = sales.reduce((s, r) => s + Number(r.cost || 0), 0) + data.rows.expenses.filter(r => String(r.date).startsWith(key) && inRange(r.date, start, end)).reduce((s, r) => s + Number(r.value || 0), 0);
    points.push({ key, label: monthly ? cursor.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '') + (key === '2026-11' && end < '2026-11-30' ? '*' : '') : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }), revenue, expenses, profit: revenue - expenses });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}
export function growth(current: number, previous: number) { return previous ? (current - previous) / Math.abs(previous) * 100 : 0; }
export type OfxEntry = { id: string; date: string; amount: number; memo: string; type: string };
export function parseOFX(text: string): OfxEntry[] {
  if (!/<OFX[\s>]/i.test(text) && !/<STMTTRN>/i.test(text)) throw new Error('Arquivo não reconhecido. Selecione um extrato OFX válido.');
  const entries: OfxEntry[] = [];
  const seenFitids = new Set<string>();
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) || [];
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, 'i'))?.[1]?.trim() || '';
  for (const block of blocks) {
    const rawAmount = tag(block, 'TRNAMT').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const amount = Number(rawAmount);
    const fitid = tag(block, 'FITID');
    if (fitid && seenFitids.has(fitid)) continue;
    if (fitid) seenFitids.add(fitid);
    const rawDate = tag(block, 'DTPOSTED').slice(0, 8);
    if (!/^\d{8}$/.test(rawDate) || !Number.isFinite(amount) || !rawAmount) continue;
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    if (Number.isNaN(Date.parse(date))) continue;
    entries.push({ id: fitid || `${date}-${amount}-${tag(block, 'MEMO')}`, date, amount, memo: tag(block, 'MEMO') || tag(block, 'NAME') || 'Movimentação bancária', type: tag(block, 'TRNTYPE') });
  }
  if (!entries.length) throw new Error('Nenhuma transação válida foi encontrada neste OFX.');
  return entries;
}
export function priceSimulation(input: { cost: number; expenses: number; tax: number; commission: number; margin: number; discount: number }) {
  const { cost, expenses, tax, commission, margin, discount } = input;
  if (Object.values(input).some(v => !Number.isFinite(v) || v < 0) || discount >= 100) throw new Error('Informe valores positivos e um desconto menor que 100%.');
  const rates = expenses + tax + commission + margin;
  if (rates >= 100) throw new Error('A soma de despesas, impostos, comissão e margem deve ser menor que 100%.');
  const price = cost / (1 - rates / 100);
  const salePrice = price * (1 - discount / 100);
  const variableRate = (expenses + tax + commission) / 100;
  const contribution = salePrice * (1 - variableRate) - cost;
  return { price, salePrice, markup: cost ? price / cost : 0, contribution, margin: salePrice ? contribution / salePrice * 100 : 0, fees: salePrice * variableRate };
}
export type Alert = { id: string; title: string; description: string; type: 'warning' | 'danger' | 'success' | 'info'; module: string; tab?: string; value?: number };
export function getAlerts(data: AppData): Alert[] {
  const alerts: Alert[] = [];
  const overdue = data.rows.receivables.filter(r => r.status === 'Pendente' && String(r.date) < REFERENCE_DATE);
  if (overdue.length) alerts.push({ id: 'overdue', title: `${overdue.length} título${overdue.length > 1 ? 's' : ''} em atraso`, description: 'Revise os recebimentos e organize a cobrança.', type: 'danger', module: 'finance', tab: 'credit' });
  const stockResources = ['rawMaterials', 'trimmings', 'workInProgress', 'finishedGoods'];
  const low = stockResources.flatMap(id => data.rows[id]).filter(r => Number(r.quantity) < Number(r.min));
  if (low.length) alerts.push({ id: 'low-stock', title: `${low.length} itens abaixo do estoque mínimo`, description: 'Planeje a reposição para evitar paradas na produção.', type: 'warning', module: 'inventory', tab: 'planning' });
  const approvals = data.rows.approvals.filter(r => r.status === 'Pendente');
  if (approvals.length) alerts.push({ id: 'approvals', title: `${approvals.length} aprovações aguardando você`, description: 'Compras e bonificações precisam da sua análise.', type: 'info', module: 'admin', tab: 'approvals' });
  const review = data.rows.productionOrders.filter(r => r.status === 'Revisão');
  if (review.length) alerts.push({ id: 'review', title: `${review.length} ordem de produção em revisão`, description: 'A etapa final de qualidade está em andamento.', type: 'success', module: 'production', tab: 'orders' });
  return alerts;
}
export function downloadFile(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: unknown) => { if (typeof v === 'number') return String(v).replace('.', ','); let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  downloadFile(filename, '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
export function validateBackup(value: unknown): AppData {
  if (!value || typeof value !== 'object') throw new Error('O arquivo não contém um backup LUXURY válido.');
  const d = value as AppData;
  if (d.version !== 1 || !d.rows || typeof d.rows !== 'object' || !d.settings || !Array.isArray(d.audit)) throw new Error('Versão ou estrutura de backup incompatível.');
  for (const [id, resource] of Object.entries(resourceMap)) {
    const rows = d.rows[id];
    if (!Array.isArray(rows) || rows.length > 10000) throw new Error(`Dados inválidos no recurso ${id}.`);
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim()) throw new Error(`Registro inválido em ${resource.title}.`);
      ids.add(row.id);
      for (const [key, v] of Object.entries(row)) if (!['__proto__', 'constructor', 'prototype'].includes(key) && !['string', 'number', 'boolean'].includes(typeof v) && v !== null) throw new Error('O backup contém valores não permitidos.');
      for (const c of resource.columns) if (['currency', 'number', 'percent'].includes(c.type || '') && row[c.key] !== undefined && (typeof row[c.key] !== 'number' || !Number.isFinite(row[c.key]))) throw new Error(`Valor numérico inválido em ${resource.title}.`);
    }
  }
  const s = d.settings;
  for (const key of ['company', 'legalName', 'cnpj', 'email', 'city', 'currency'] as const) if (typeof s[key] !== 'string' || s[key].length > 500) throw new Error('Configurações da empresa inválidas.');
  if (!s.company.trim() || typeof s.monthlyGoal !== 'number' || !Number.isFinite(s.monthlyGoal) || s.monthlyGoal < 0 || typeof s.notifications !== 'boolean' || typeof s.compact !== 'boolean') throw new Error('Configurações inválidas.');
  if (!d.permissions || typeof d.permissions !== 'object') throw new Error('Permissões inválidas.');
  for (const [role, ids] of Object.entries(d.permissions)) if (!['Administrador', 'Gestor', 'Financeiro', 'Comercial', 'Produção', 'Visualizador'].includes(role) || !Array.isArray(ids) || ids.some(id => !modules.some(m => m.id === id))) throw new Error('Permissões inválidas.');
  if (d.audit.length > 20000 || d.audit.some(a => !a || typeof a.id !== 'string' || typeof a.date !== 'string' || typeof a.user !== 'string' || typeof a.action !== 'string' || typeof a.detail !== 'string' || typeof a.module !== 'string')) throw new Error('Histórico de auditoria inválido.');
  if (!d.integrations || typeof d.integrations !== 'object' || Object.values(d.integrations).some(v => typeof v !== 'boolean')) throw new Error('Integrações inválidas.');
  if (!Array.isArray(d.messages) || d.messages.length > 1000 || d.messages.some(m => !m || typeof m.id !== 'string' || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string')) throw new Error('Conversas inválidas.');
  return { version: 1, rows: Object.fromEntries(Object.keys(resourceMap).map(id => [id, d.rows[id]])), settings: s, audit: d.audit, permissions: d.permissions, integrations: d.integrations, messages: d.messages, notificationsRead: Boolean(d.notificationsRead) };
}
export function normalizeRow(resource: string, input: Row): Row {
  const row = { ...input };
  const n = (key: string) => Number(row[key] || 0);
  const set = (key: string, value: number) => { row[key] = Math.round(value * 100) / 100; };
  if (['rawMaterials', 'trimmings', 'workInProgress', 'finishedGoods'].includes(resource)) set('total', n('quantity') * n('cost'));
  if (resource === 'payroll') set('value', n('gross') - n('deductions'));
  if (['payrollCharges', 'taxes', 'commissions'].includes(resource)) set('value', n('base') * n('rate') / 100);
  if (resource === 'simpleNational') set('value', n('revenue12') * n('rate') / 100);
  if (resource === 'timeStudies') set('standard', n('observed') * (1 + n('tolerance') / 100));
  if (resource === 'costSheets') { set('total', n('materials') + n('labor') + n('overhead')); set('margin', n('price') ? (n('price') - n('total')) / n('price') * 100 : 0); }
  if (resource === 'profitability') { set('profit', n('revenue') - n('cost')); set('margin', n('revenue') ? n('profit') / n('revenue') * 100 : 0); }
  if (['salesGoals', 'productionGoals', 'hrProductivity'].includes(resource)) set('progress', n('target') ? n('achieved') / n('target') * 100 : 0);
  if (resource === 'productionOrders') set('progress', n('quantity') ? n('completed') / n('quantity') * 100 : 0);
  if (resource === 'supplierReviews') set('rating', (n('quality') + n('delivery')) / 2);
  if (resource === 'campaigns') set('roas', n('budget') ? n('revenue') / n('budget') : 0);
  if (resource === 'salesOrders' && !row.cost) set('cost', n('value') * 0.43);
  if (resource === 'salesOrders') row.channel = row.category;
  if (resource === 'manufacturingCosts') row.unitCost = row.value;
  return row;
}
export function localAnswer(question: string, data: AppData): string {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const month = periodBounds('month');
  const m = metricsFor(data, month.start, month.end);
  if (/estoque|reposicao|insumo/.test(q)) {
    const low = ['rawMaterials', 'trimmings', 'workInProgress', 'finishedGoods'].flatMap(id => data.rows[id]).filter(r => Number(r.quantity) < Number(r.min));
    return `Analisei ${['rawMaterials', 'trimmings', 'workInProgress', 'finishedGoods'].reduce((n, id) => n + data.rows[id].length, 0)} itens de estoque. ${low.length ? `${low.length} estão abaixo do mínimo: ${low.map(r => `${r.name} (${r.quantity} ${r.unit}, mínimo ${r.min})`).join('; ')}. Recomendo solicitar cotações e confirmar o prazo dos fornecedores antes de liberar novas ordens.` : 'Nenhum item está abaixo do estoque mínimo. Mantenha as contagens cíclicas e acompanhe a cobertura para a próxima coleção.'}`;
  }
  if (/producao|eficiencia|costura|ordem/.test(q)) {
    const orders = data.rows.productionOrders.filter(r => r.status !== 'Concluída');
    return `Há ${orders.length} ordens de produção em andamento ou planejadas, com ${orders.reduce((s, r) => s + Number(r.quantity || 0), 0)} peças previstas. ${orders.filter(r => r.status === 'Revisão').length} ordem(ns) estão em revisão. Priorize as entregas mais próximas, confira os materiais disponíveis e valide o tempo padrão antes de assumir novas datas. Os dados são demonstrativos.`;
  }
  if (/finance|caixa|inadimpl|receber|pagar|despesa/.test(q)) {
    const balance = data.rows.bankAccounts.reduce((s, r) => s + Number(r.balance || 0), 0);
    const receivable = data.rows.receivables.filter(r => r.status === 'Pendente').reduce((s, r) => s + Number(r.value), 0);
    const payable = data.rows.payables.filter(r => r.status === 'Pendente').reduce((s, r) => s + Number(r.value), 0);
    const overdue = data.rows.receivables.filter(r => r.status === 'Pendente' && String(r.date) < REFERENCE_DATE);
    return `O saldo bancário cadastrado é R$ ${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Há R$ ${receivable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a receber e R$ ${payable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a pagar. ${overdue.length} título(s) estão vencidos. Minha recomendação: priorizar a cobrança dos atrasos e conferir a conciliação antes de projetar novas saídas. Esse saldo vem do backup e não é uma consulta bancária ao vivo.`;
  }
  if (/previsao|projecao|futuro|crescer/.test(q)) {
    const complete = chartSeries(data, '2026-08-01', '2026-10-31');
    const average = complete.reduce((s, p) => s + p.revenue, 0) / Math.max(complete.length, 1);
    return `Com base na média dos três últimos meses completos, a referência mensal é R$ ${average.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. Um cenário de crescimento de 8% indicaria R$ ${(average * 1.08).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} no próximo mês. É uma projeção aritmética, não uma garantia: considere sazonalidade, capacidade produtiva e carteira de pedidos.`;
  }
  if (/comercial|venda|cliente|meta|faturamento/.test(q)) return `Neste mês, os pedidos registraram R$ ${m.revenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em faturamento, com ticket médio de R$ ${m.averageTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}. A meta é R$ ${data.settings.monthlyGoal.toLocaleString('pt-BR')}. Recomendo revisar as propostas abertas no CRM e priorizar a recompra dos clientes com maior histórico. Acompanhe a conversão por vendedor antes de ampliar os descontos.`;
  return `Panorama de novembro: faturamento de R$ ${m.revenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}, lucro líquido operacional estimado de R$ ${m.netProfit.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} e margem de contribuição de ${m.contributionMargin.toFixed(1)}%. Há ${getAlerts(data).length} pontos de atenção. Posso detalhar finanças, vendas, produção, estoque ou previsão. Esta análise usa regras locais sobre os dados deste workspace; não está conectada a um modelo de IA externo.`;
}
