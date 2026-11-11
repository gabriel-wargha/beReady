import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { GuestOnly, RequireAuth } from './components/RequireAuth';
import './index.css';
import { ComingSoon, Dashboard, NotFound, Settings } from './pages/AppPages';
import { Login, Signup } from './pages/AuthPages';
import { FactBank, Confirmations } from './pages/FactBank';
import { ImportPage } from './pages/Import';
import { Onboarding } from './pages/Onboarding';
import { Landing } from './pages/Landing';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<GuestOnly />}>
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="facts" element={<FactBank />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="confirm" element={<Confirmations />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route
                path="jobs"
                element={
                  <ComingSoon
                    title="Jobs"
                    phase={3}
                    text="Paste a job posting to see your match score, the evidence, your gaps and interview prep."
                  />
                }
              />
              <Route
                path="documents"
                element={
                  <ComingSoon
                    title="Documents"
                    phase={4}
                    text="Tailored one-page resumes and cover letters, as .docx and PDF."
                  />
                }
              />
              <Route
                path="review"
                element={
                  <ComingSoon
                    title="Review"
                    phase={4}
                    text="Upload any resume or letter and get line-by-line suggestions and fact checks."
                  />
                }
              />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
