import { Suspense } from 'react';
import Editor from '../components/Editor';

function EditorWrapper() {
  return <Editor />;
}

export default function ArticlePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <EditorWrapper />
    </Suspense>
  );
}

