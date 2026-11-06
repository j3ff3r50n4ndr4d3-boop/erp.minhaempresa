import { useEffect, useState } from 'react';
import type { Module } from './types';
import type { Navigate } from './App';
import { resourceMap } from './data';
import { downloadFile } from './domain';
import { useStore } from './store';
import { Button, Icon, InfoBox, Modal, PageHeader } from './components';
import { ResourceTable } from './ResourceTable';
import { DrePanel, FinanceOverview, OfxPanel, OverduePanel, ProjectionPanel } from './FinancePanels';
import { AbcPanel, HrOverview, InventoryOverview, OperationsPanel, PayrollSummaryPanel, ProductionOverview, PurchaseDeadlinesPanel, PurchasesOverview, StandardTimePanel, StockMovementPanel } from './OperationsPanels';
import { AccountingPanel, ChannelProfitPanel, CostMinutePanel, CostsOverview, CustomerHistoryPanel, FiscalDemoPanel, FiscalOverview, IntegrationsPanel, MarketingOverview, PricingPanel, SalesOverview, TaxCalculatorPanel, TrafficPanel, WhatsappPanel, XmlPanel } from './BusinessPanels';
import { AgentsPanel, AiChat, AuditPanel, BackupPanel, InsightsPanel, PermissionsPanel, SettingsPanel } from './IntelligenceAdmin';

function Panel({ id, navigate }: { id?: string; navigate: Navigate }) {
  switch (id) {
    case 'finance-overview': return <FinanceOverview navigate={navigate} />;
    case 'ofx': return <OfxPanel />;
    case 'dre': return <DrePanel />;
    case 'overdue': return <OverduePanel />;
    case 'projection': return <ProjectionPanel />;
    case 'sales-overview': return <SalesOverview />;
    case 'customer-history': return <CustomerHistoryPanel />;
    case 'whatsapp': return <WhatsappPanel navigate={navigate} />;
    case 'production-overview': return <ProductionOverview />;
    case 'operations': return <OperationsPanel />;
    case 'standard-time': return <StandardTimePanel />;
    case 'inventory-overview': return <InventoryOverview />;
    case 'stock-movement': return <StockMovementPanel />;
    case 'abc': return <AbcPanel />;
    case 'hr-overview': return <HrOverview />;
    case 'payroll-summary': return <PayrollSummaryPanel />;
    case 'purchases-overview': return <PurchasesOverview />;
    case 'purchase-deadlines': return <PurchaseDeadlinesPanel />;
    case 'fiscal-overview': return <FiscalOverview />;
    case 'fiscal-demo': return <FiscalDemoPanel />;
    case 'xml': return <XmlPanel />;
    case 'tax-calculator': return <TaxCalculatorPanel />;
    case 'accounting': return <AccountingPanel />;
    case 'marketing-overview': return <MarketingOverview />;
    case 'integrations': return <IntegrationsPanel />;
    case 'traffic': return <TrafficPanel />;
    case 'costs-overview': return <CostsOverview />;
    case 'cost-minute': return <CostMinutePanel />;
    case 'pricing': return <PricingPanel />;
    case 'channel-profit': return <ChannelProfitPanel />;
    case 'ai-chat': return <AiChat />;
    case 'agents': return <AgentsPanel navigate={navigate} />;
    case 'insights': return <InsightsPanel navigate={navigate} />;
    case 'permissions': return <PermissionsPanel />;
    case 'audit': return <AuditPanel />;
    case 'backup': return <BackupPanel />;
    case 'settings': return <SettingsPanel />;
    default: return null;
  }
}
export function ModulePage({ module, tab, navigate }: { module: Module; tab?: string; navigate: Navigate }) {
  const { data, toast } = useStore(); const active = module.tabs.find(t => t.id === tab) || module.tabs[0]; const [resource, setResource] = useState(active.resources?.[0] || ''); const [featuresOpen, setFeaturesOpen] = useState(false);
  useEffect(() => { setResource(active.resources?.[0] || ''); }, [active.id]);
  const exportModule = () => { const rows = Object.fromEntries(Object.entries(data.rows).filter(([id]) => resourceMap[id].module === module.id)); downloadFile(`luxury-${module.id}-dados.json`, JSON.stringify({ module: module.name, exportedAt: new Date().toISOString(), rows }, null, 2), 'application/json'); toast('Dados do módulo exportados em JSON.'); };
  return <div className="module-content"><PageHeader eyebrow={`MÓDULO ${module.number} · LUXURY ERP`} title={module.name} description={module.description} icon={module.icon} actions={<><Button icon="Layers" onClick={() => setFeaturesOpen(true)}>Todos os recursos</Button><Button icon="Download" onClick={exportModule}>Exportar dados</Button></>} /><div className="module-tabs" role="tablist" aria-label={`Recursos de ${module.name}`}>{module.tabs.map(t => <button key={t.id} role="tab" aria-selected={active.id === t.id} className={`module-tab ${active.id === t.id ? 'active' : ''}`} onClick={() => navigate(module.id, t.id)}>{t.label}</button>)}</div><div role="tabpanel" aria-label={active.label}>{active.panel && <div className={active.resources?.length ? 'mb-20' : ''}><Panel id={active.panel} navigate={navigate} /></div>}{active.resources && active.resources.length > 1 && <div className="resource-switcher">{active.resources.map(id => <button key={id} className={`resource-pill ${resource === id ? 'active' : ''}`} onClick={() => setResource(id)}>{resourceMap[id].title}</button>)}</div>}{resource && <ResourceTable key={resource} resourceId={resource} />}{!active.panel && !active.resources?.length && <InfoBox>Selecione um recurso para começar.</InfoBox>}</div>{featuresOpen && <Modal title={`Recursos de ${module.short}`} subtitle={`${module.features.length} frentes integradas ao seu workspace`} onClose={() => setFeaturesOpen(false)} wide><div className="feature-list">{module.features.map(f => <div key={f}><Icon name="CircleCheck" size={16} />{f}</div>)}</div><InfoBox>Os recursos estão organizados nas abas deste módulo. Cadastros e cálculos funcionam localmente; integrações externas e obrigações legais estão identificadas como demonstrações quando aplicável.</InfoBox><div className="modal-actions"><Button variant="primary" onClick={() => setFeaturesOpen(false)}>Entendi</Button></div></Modal>}</div>;
}
