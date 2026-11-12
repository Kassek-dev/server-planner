import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { createAppRouter } from './router';
import { UpdatePrompt } from './UpdatePrompt';

export function App() {
  const [router] = useState(createAppRouter);
  return (
    <>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </>
  );
}
