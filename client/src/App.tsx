import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { OpportunityDetail } from './pages/OpportunityDetail';
import { SavedOpportunities } from './pages/SavedOpportunities';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  // Fire-and-forget health ping to wake Render instance on app load
  useEffect(() => {
    fetch(`${API_BASE_URL}/health`).catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/opportunities/:id" element={<OpportunityDetail />} />
            <Route path="/saved" element={<SavedOpportunities />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
