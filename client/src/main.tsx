import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Outfit sets everything; Fraunces italic is the one accent (wght and opsz axes, for the display cut).
import '@fontsource-variable/outfit';
import '@fontsource-variable/fraunces/opsz-italic.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
