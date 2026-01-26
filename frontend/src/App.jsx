import React from "react";
import { StoreProvider } from "./contexts/StoreContext";
import MainLayout from "./layouts/MainLayout";

export default function App() {
  return (
    <StoreProvider>
      <MainLayout />
    </StoreProvider>
  );
}
