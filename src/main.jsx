import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './App.jsx';
import Home from './Home.jsx';
import { LangProvider } from './i18n.jsx';
import './styles.css';

// Home screen (new project + history) until a project is opened, then the editor.
function Root() {
  const [open, setOpen] = useState(null); // { id, project }
  if (open) return <Editor key={open.id} projectId={open.id} initialProject={open.project} onHome={() => setOpen(null)} />;
  return <Home onOpen={setOpen} />;
}

createRoot(document.getElementById('root')).render(<LangProvider><Root /></LangProvider>);
