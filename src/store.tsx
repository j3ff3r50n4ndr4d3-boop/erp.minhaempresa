import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppData, Audit, Row, Settings } from './types';
import { createInitialData, resourceMap, STORAGE_KEY, uid, REFERENCE_DATE } from './data';
import { validateBackup } from './domain';

type Toast = { id: string; message: string; type: 'success' | 'error' | 'info' };
type Store = { data: AppData; toasts: Toast[]; toast: (message: string, type?: Toast['type']) => void; dismissToast: (id: string) => void; createRow: (resource: string, values: Row) => void; updateRow: (resource: string, id: string, values: Row) => void; deleteRow: (resource: string, id: string) => void; settle: (resource: string, id: string, accountId: string, date: string) => boolean; reconcile: (matches: { resource: string; id: string; date: string }[], accountId: string) => number; approve: (resource: string, id: string, approved: boolean) => void; advanceProduction: (resource: string, id: string) => void; applyMovement: (id: string) => boolean; saveSettings: (settings: Settings) => void; savePermissions: (permissions: Record<string, string[]>) => void; restore: (data: unknown) => boolean; reset: () => void; markNotifications: () => void; setIntegration: (id: string, enabled: boolean) => void; addMessage: (role: 'user' | 'assistant', text: string) => void; clearMessages: () => void; log: (action: string, detail: string, module: string) => void };
const Context = createContext<Store | null>(null);
function load(): AppData {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return validateBackup(JSON.parse(raw)); } catch { /* A damaged or incompatible local cache must not prevent the workspace from opening. */ }
  return createInitialData();
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: Toast['type'] = 'success') => { const id = uid(); setToasts(t => [...t.slice(-3), { id, message, type }]); window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000); }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { toast('Armazenamento local indisponível. Exporte um backup para preservar suas alterações.', 'error'); } }, [data, toast]);
  const entry = (action: string, detail: string, module: string): Audit => ({ id: uid(), date: new Date().toISOString(), user: 'Jefferson Andrade', action, detail, module });
  const commit = (next: AppData, action: string, detail: string, module: string) => setData({ ...next, audit: [entry(action, detail, module), ...next.audit].slice(0, 20000) });
  const log = (action: string, detail: string, module: string) => setData(d => ({ ...d, audit: [entry(action, detail, module), ...d.audit].slice(0, 20000) }));
  const createRow = (resource: string, values: Row) => {
    const next = structuredClone(data); const row: Row = { ...values, id: uid() };
    next.rows[resource].unshift(row);
    if (resource === 'salesOrders' && row.status !== 'Cancelado') {
      const due = new Date(String(row.date || REFERENCE_DATE) + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + 30);
      next.rows.receivables.unshift({ id: uid(), name: `${row.name} · Recebimento`, category: 'Vendas', value: Number(row.value), date: due.toISOString().slice(0, 10), status: 'Pendente', account: next.rows.bankAccounts[0]?.name || '', accountId: next.rows.bankAccounts[0]?.id || '', sourceId: row.id, receivedDate: '' });
    }
    commit(next, 'Registro criado', `${resourceMap[resource].singular}: ${row.name}`, resourceMap[resource].module);
    toast(resource === 'salesOrders' ? 'Pedido criado e conta a receber gerada.' : `${resourceMap[resource].singular.charAt(0).toUpperCase() + resourceMap[resource].singular.slice(1)} criado com sucesso.`);
  };
  const updateRow = (resource: string, id: string, values: Row) => {
    const next = structuredClone(data); const old = next.rows[resource].find(r => r.id === id); if (!old) return;
    const changes = Object.entries(values).filter(([k, v]) => old[k] !== v).map(([k]) => resourceMap[resource].columns.find(c => c.key === k)?.label || k);
    next.rows[resource] = next.rows[resource].map(r => r.id === id ? { ...r, ...values, id } : r);
    if (resource === 'salesOrders') {
      const linked = next.rows.receivables.find(r => r.sourceId === id && r.status === 'Pendente');
      if (linked) { const due = new Date(String(values.date || old.date || REFERENCE_DATE) + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + 30); Object.assign(linked, { name: `${values.name || old.name} · Recebimento`, value: Number(values.value ?? old.value), date: due.toISOString().slice(0, 10) }); }
    }
    commit(next, 'Registro atualizado', `${old.name}${changes.length ? ` · Campos: ${changes.join(', ')}` : ''}`, resourceMap[resource].module); toast('Alterações salvas com sucesso.');
  };
  const deleteRow = (resource: string, id: string) => {
    const next = structuredClone(data); const row = next.rows[resource].find(r => r.id === id); if (!row) return;
    if (resource === 'bankAccounts' && [...next.rows.payables, ...next.rows.receivables].some(r => r.accountId === id)) { toast('Esta conta possui títulos vinculados. Atualize os vínculos antes de excluí-la.', 'error'); return; }
    next.rows[resource] = next.rows[resource].filter(r => r.id !== id);
    if (resource === 'salesOrders') next.rows.receivables = next.rows.receivables.filter(r => r.sourceId !== id || r.status === 'Recebido');
    commit(next, 'Registro excluído', String(row.name), resourceMap[resource].module); toast('Registro excluído.');
  };
  const settle = (resource: string, id: string, accountId: string, date: string) => {
    const next = structuredClone(data); const row = next.rows[resource].find(r => r.id === id); const account = next.rows.bankAccounts.find(a => a.id === accountId);
    if (!row || !account || row.status !== 'Pendente') { toast('Selecione um título pendente e uma conta válida.', 'error'); return false; }
    const incoming = resource === 'receivables'; const amount = Number(row.value);
    if (!Number.isFinite(amount) || amount <= 0) { toast('O valor do título precisa ser positivo.', 'error'); return false; }
    if (!incoming && Number(account.balance) < amount) { toast('Saldo insuficiente nesta conta. Selecione outra conta ou registre uma transferência.', 'error'); return false; }
    account.balance = Math.round((Number(account.balance) + (incoming ? amount : -amount)) * 100) / 100;
    Object.assign(row, { status: incoming ? 'Recebido' : 'Pago', [incoming ? 'receivedDate' : 'paidDate']: date, account: account.name, accountId });
    commit(next, incoming ? 'Recebimento confirmado' : 'Pagamento confirmado', `${row.name} · ${account.name}`, 'finance'); toast(`${incoming ? 'Recebimento' : 'Pagamento'} confirmado. Saldo de ${account.name} atualizado.`); return true;
  };
  const reconcile = (matches: { resource: string; id: string; date: string }[], accountId: string) => {
    const next = structuredClone(data); const account = next.rows.bankAccounts.find(a => a.id === accountId); if (!account) return 0;
    let count = 0;
    for (const match of matches) {
      const row = next.rows[match.resource]?.find(r => r.id === match.id); if (!row || row.status !== 'Pendente') continue;
      const incoming = match.resource === 'receivables'; const amount = Number(row.value); if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!incoming && Number(account.balance) < amount) continue;
      account.balance = Math.round((Number(account.balance) + (incoming ? amount : -amount)) * 100) / 100;
      Object.assign(row, { status: incoming ? 'Recebido' : 'Pago', [incoming ? 'receivedDate' : 'paidDate']: match.date, account: account.name, accountId }); count++;
    }
    if (count) { commit(next, 'Conciliação OFX', `${count} títulos conciliados com ${account.name}`, 'finance'); toast(`${count} títulos conciliados. Saldo bancário atualizado.`); } else toast('Nenhum título pôde ser conciliado. Verifique o saldo e as correspondências.', 'error');
    return count;
  };
  const approve = (resource: string, id: string, approved: boolean) => {
    const next = structuredClone(data); const row = next.rows[resource].find(r => r.id === id); if (!row || row.status !== 'Pendente') return;
    row.status = approved ? 'Aprovado' : 'Rejeitado';
    if (approved && resource === 'purchaseOrders' && !next.rows.payables.some(r => r.sourceId === id)) next.rows.payables.unshift({ id: uid(), name: String(row.name), category: 'Fornecedores', value: Number(row.value), date: String(row.date), status: 'Pendente', account: next.rows.bankAccounts[0]?.name || '', accountId: next.rows.bankAccounts[0]?.id || '', paidDate: '', sourceId: id });
    commit(next, approved ? 'Operação aprovada' : 'Operação rejeitada', String(row.name), resourceMap[resource].module); toast(approved ? 'Operação aprovada.' : 'Operação rejeitada.');
  };
  const advanceProduction = (resource: string, id: string) => {
    const next = structuredClone(data); const row = next.rows[resource].find(r => r.id === id); if (!row) return;
    const stages = ['Planejada', 'Em produção', 'Revisão', 'Concluída']; const index = stages.indexOf(String(row.status)); if (index < 0 || index === 3) return;
    row.status = stages[index + 1]; row.progress = [0, 65, 95, 100][index + 1]; if (row.status === 'Concluída' && row.quantity !== undefined) row.completed = row.quantity;
    commit(next, 'Etapa de produção avançada', `${row.name} → ${row.status}`, 'production'); toast(`Ordem avançada para ${String(row.status).toLowerCase()}.`);
  };
  const applyMovement = (id: string) => {
    const next = structuredClone(data); const movement = next.rows.stockMovements.find(r => r.id === id); if (!movement || movement.status === 'Concluído') return false;
    const ids = ['rawMaterials', 'trimmings', 'workInProgress', 'finishedGoods'];
    const source = ids.find(key => next.rows[key].some(r => r.sku === movement.sku)); const item = source ? next.rows[source].find(r => r.sku === movement.sku) : undefined;
    const qty = Number(movement.quantity), cost = Number(movement.cost || item?.cost || 0), oldQty = Number(item?.quantity || 0), oldCost = Number(item?.cost || 0);
    if (!item || !source || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) { toast('Informe um SKU existente, quantidade positiva e custo válido.', 'error'); return false; }
    if (movement.category === 'Saída' && qty > oldQty) { toast(`Estoque insuficiente: disponível ${oldQty} ${item.unit}.`, 'error'); return false; }
    const newQty = movement.category === 'Entrada' ? oldQty + qty : movement.category === 'Saída' ? oldQty - qty : qty;
    item.quantity = newQty; item.cost = movement.category === 'Entrada' && newQty ? Math.round((oldQty * oldCost + qty * cost) / newQty * 100) / 100 : cost || oldCost; item.total = Math.round(newQty * Number(item.cost) * 100) / 100; movement.status = 'Concluído';
    commit(next, 'Movimentação efetivada', `${movement.category}: ${qty} ${item.unit} · ${item.name}`, 'inventory'); toast('Estoque e custo médio atualizados.'); return true;
  };
  const saveSettings = (settings: Settings) => { commit({ ...data, settings }, 'Configurações atualizadas', settings.company, 'admin'); toast('Configurações salvas.'); };
  const savePermissions = (permissions: Record<string, string[]>) => { commit({ ...data, permissions }, 'Permissões atualizadas', 'Matriz de acesso por perfil salva neste workspace demonstrativo.', 'admin'); toast('Matriz de permissões salva.'); };
  const restore = (value: unknown) => { try { const validated = validateBackup(value); commit(validated, 'Backup restaurado', 'Todos os módulos foram substituídos pelos dados do arquivo.', 'admin'); toast('Backup restaurado com sucesso.'); return true; } catch (e) { toast(e instanceof Error ? e.message : 'Backup inválido.', 'error'); return false; } };
  const reset = () => { setData(createInitialData()); toast('Workspace demonstrativo restaurado.'); };
  const markNotifications = () => setData(d => ({ ...d, notificationsRead: true }));
  const setIntegration = (id: string, enabled: boolean) => { commit({ ...data, integrations: { ...data.integrations, [id]: enabled } }, 'Integração demonstrativa', `${id}: ${enabled ? 'simulação ativada' : 'simulação desativada'}`, 'marketing'); toast(enabled ? 'Simulação ativada. Nenhum serviço externo foi conectado.' : 'Simulação desativada.', 'info'); };
  const addMessage = (role: 'user' | 'assistant', text: string) => setData(d => ({ ...d, messages: [...d.messages, { id: uid(), role, text }].slice(-100) }));
  const clearMessages = () => setData(d => ({ ...d, messages: [] }));
  return <Context.Provider value={{ data, toasts, toast, dismissToast: id => setToasts(t => t.filter(x => x.id !== id)), createRow, updateRow, deleteRow, settle, reconcile, approve, advanceProduction, applyMovement, saveSettings, savePermissions, restore, reset, markNotifications, setIntegration, addMessage, clearMessages, log }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('StoreProvider ausente'); return store; }
