import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function apiPreconnectPlugin(): Plugin {
  return {
    name: "api-preconnect",
    transformIndexHtml(html) {
      const apiBase = process.env.VITE_API_BASE?.trim();
      if (!apiBase) return html;
      try {
        const origin = new URL(apiBase).origin;
        return html.replace(
          "</head>",
          `  <link rel="dns-prefetch" href="${origin}" />\n  <link rel="preconnect" href="${origin}" crossorigin />\n</head>`
        );
      } catch {
        return html;
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), apiPreconnectPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true
  },
  build: {
    target: "es2022",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
        }
      }
    }
  }
});
