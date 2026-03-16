import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { apiClient } from './api/client';

const Home = lazy(() => import('./pages/Home'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const SavedOpportunities = lazy(() => import('./pages/SavedOpportunities'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function AppContent() {
  // Fire-and-forget health ping to wake Render instance on app load
  useEffect(() => {
    apiClient.get('/health').catch(() => {});
  }, []);

  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/saved" element={<SavedOpportunities />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
