
import { AdminLayout } from './components/AdminLayout';
import { Dashboard } from './components/Dashboard';
import { KnowledgeBase } from './components/KnowledgeBase';
import { ToolsIntegrations } from './components/ToolsIntegrations';
import { SettingsPanel } from './components/SettingsPanel';

export function App() {
  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col overflow-y-auto">
        <Dashboard />
        <KnowledgeBase />
        <ToolsIntegrations />
        <SettingsPanel />
      </div>
    </AdminLayout>
  );
}
