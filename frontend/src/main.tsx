/**
 * Vite Entry Point
 * Initializes React application and mounts to DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Mount React application
// StrictMode disabled in dev to avoid WebSocket double connections
// Re-enable for production builds
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
