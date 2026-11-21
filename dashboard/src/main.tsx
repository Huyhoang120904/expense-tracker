import React from "react";
import ReactDOM from "react-dom/client";
import { AnimateUIProvider } from "@animate-ui/react/provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AnimateUIProvider reducedMotion="user">
          <TooltipProvider delayDuration={250}>
            <App />
          </TooltipProvider>
        </AnimateUIProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
