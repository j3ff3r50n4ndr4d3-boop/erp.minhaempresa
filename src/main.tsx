import { Component, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './store';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { if (this.state.error) return <div className="loading-screen"><div style={{ textAlign: 'center', padding: 30 }}><h1>LUXURY ERP</h1><p style={{ margin: '16px 0', fontSize: 13 }}>Não foi possível abrir o workspace. Seus dados locais foram preservados.</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Tentar novamente</button></div></div>; return this.props.children; }
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><StoreProvider><App /></StoreProvider></ErrorBoundary></StrictMode>);
