
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';

export function App() {
  return (
    <Layout>
      <Sidebar />
      <Chat />
    </Layout>
  );
}
