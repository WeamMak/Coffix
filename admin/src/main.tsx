import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { createWebClient } from './api/client';
import { WebSessionProvider } from './features/auth/useWebSession';
import { AppRoutes } from './router';
import './styles.css';

const client = createWebClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1' });
createRoot(document.getElementById('root')!).render(
  <StrictMode><WebSessionProvider client={client}><BrowserRouter><AppRoutes /></BrowserRouter></WebSessionProvider></StrictMode>,
);
