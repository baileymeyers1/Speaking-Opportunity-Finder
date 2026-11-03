import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TooltipProvider } from './components/ui/tooltip';
import { Layout } from './components/Layout';
import { apiClient } from './api/client';
import { persistOptions, queryClient, removeLegacyCaches } from './lib/queryClient';

const Home = lazy(() => import('./pages/Home'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const SavedOpportunities = lazy(() => import('./pages/SavedOpportunities'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Profile = lazy(() => import('./pages/Profile'));

function AppContent() {
  // Fire-and-forget health ping to warm the serverless function on app load
  useEffect(() => {
    removeLegacyCaches();
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
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

/** Restores persisted queries from localStorage when storage is available. */
function QueryProvider({ children }: { children: React.ReactNode }) {
  if (persistOptions) {
    return (
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        {children}
      </PersistQueryClientProvider>
    );
  }
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function App() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}

export default App;
