import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider } from './auth';
import './index.css';
import { FeedbackProvider } from './components/feedback';
import { Layout, RequireAuth } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { GroupPage } from './pages/GroupPage';
import { GroupsPage } from './pages/GroupsPage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/register', element: <AuthPage mode="register" /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <GroupsPage /> },
          { path: '/groups/:groupId', element: <GroupPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user": honour the OS "reduce motion" setting; transforms are skipped, fades kept. */}
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <FeedbackProvider>
          <RouterProvider router={router} />
        </FeedbackProvider>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
);
