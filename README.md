# LUXURY ERP · Gestão Empresarial

Workspace ERP em português para gestão de uma confecção, com painel executivo e 12 módulos integrados. Construído com React, TypeScript, Vite, Recharts e Lucide.

## Executar

```bash
npm install
npm run dev
```

O servidor de desenvolvimento abre em `http://localhost:5173` e escuta em `0.0.0.0`.

```bash
npm test        # testes de domínio e integridade dos dados
npm run build   # type-check + build de produção
npm run preview # servir o build localmente
```

## Módulos

1. **Painel de Gestão · CEO** — faturamento, lucro bruto/líquido, margem de contribuição, despesas, metas, indicadores e alertas.
2. **Financeiro** — contas a pagar/receber, fluxo de caixa, contas bancárias, conciliação OFX, DRE, centros de custo, empréstimos, inadimplência e projeções.
3. **Comercial e Vendas** — pedidos, orçamentos, clientes, tabelas de preço, comissões, metas, CRM/WhatsApp, histórico e pós-venda.
4. **PCP e Produção** — ordens, planejamento, fichas técnicas, roteiros, corte, costura, facções, acabamento, cronometragem, tempo padrão, produtividade e bonificações.
5. **Estoque e Almoxarifado** — matérias-primas, aviamentos, produtos em processo/acabados, movimentações, inventário, lotes, estoque mínimo, curva ABC e custo médio.
6. **RH e Departamento Pessoal** — colaboradores, admissões/desligamentos, folha, encargos, férias, 13º, provisões, ponto, horas extras, comissões e produtividade.
7. **Compras e Fornecedores** — solicitações, cotações, pedidos, aprovações, fornecedores, recebimento, prazos e avaliação.
8. **Fiscal e Contábil** — controle de notas, entradas/saídas, importação de XML, DANFE demonstrativo, tributos, Simples Nacional estimado, relatórios e lote contábil.
9. **Marketing e E-commerce** — campanhas, leads, coleções, catálogo, marketplaces, promoções e indicadores de tráfego.
10. **Custos e Precificação** — custo de fabricação, custo minuto, fichas de custo, markup divisor, margem, formação de preço, descontos e rentabilidade.
11. **Inteligência Artificial** — CEO Digital e agentes financeiro/comercial/produção/estoque com análise local por regras, anomalias e previsão aritmética.
12. **Administração e Segurança** — usuários, matriz de permissões, aprovações, auditoria, backup/restauração e configurações.

## Dados e persistência

- Os dados são **demonstrativos** e ficam no `localStorage` do navegador (`luxury-erp-v1`).
- O arquivo original `financehub-backup-2026-09-01.json` foi preservado e importado no Financeiro: 3 contas, 17 contas a pagar e 13 contas a receber.
- A data de referência da demonstração é **06/11/2026**.
- Novos pedidos de venda geram conta a receber; baixas financeiras atualizam o saldo da conta; entradas de estoque recalculam o custo médio ponderado; saídas validam saldo.
- Exporte um backup JSON em **Administração → Backup e restauração** antes de limpar o navegador ou trocar de dispositivo.

## Limitações importantes

Esta versão é um **protótipo funcional local**, não um ERP fiscal/contábil homologado:

- Não há backend, autenticação real nem autorização de servidor. A matriz de permissões é uma configuração de referência.
- NF-e/DANFE são demonstrativos. Não há certificado digital, transmissão à SEFAZ nem validação de autorização.
- WhatsApp abre conversa/manual via `wa.me`; não há Business API nem disparos automáticos.
- Marketplaces são simulações locais; nenhuma credencial ou conta externa é conectada.
- Os agentes de IA usam regras determinísticas sobre os dados locais, sem modelo externo.
- DRE, impostos, Simples Nacional, folha e encargos são estimativas gerenciais e exigem validação contábil/trabalhista.
- A trilha de auditoria é local e não imutável.

## Estrutura

```text
src/
  App.tsx                 shell, navegação, busca global, notificações
  Dashboard.tsx           painel executivo
  ModulePage.tsx          roteamento por módulo/aba
  ResourceTable.tsx       CRUD genérico, filtros, exportação, detalhes e baixas
  data.ts                 catálogo de módulos/recursos e seeds
  domain.ts               métricas, OFX, precificação, validação de backup, CSV
  domain.test.ts          testes de domínio
  store.tsx               estado persistido e operações integradas
  *Panels.tsx             painéis especializados por área
  charts.tsx              gráficos Recharts
  components.tsx          componentes de interface
  styles.css              design system e responsividade
```
