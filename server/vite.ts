import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { PassThrough } from "stream";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/entry-client.tsx"`,
        `src="/src/entry-client.tsx?v=${nanoid()}"`,
      );
      const html = await vite.transformIndexHtml(url, template);

      // Load the server entry module
      const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");

      // Split HTML at the SSR outlet
      const [htmlStart, htmlEnd] = html.split("<!--ssr-outlet-->");

      // Get the pipeable stream from React
      const { pipe } = render(url);

      // Set up response
      res.status(200).set({ "Content-Type": "text/html" });

      // Write the start of the HTML
      res.write(htmlStart);

      // Create a PassThrough stream to capture React's output
      const passThrough = new PassThrough();

      passThrough.on("data", (chunk) => {
        res.write(chunk);
      });

      passThrough.on("end", () => {
        res.write(htmlEnd);
        res.end();
      });

      passThrough.on("error", (err) => {
        vite.ssrFixStacktrace(err);
        next(err);
      });

      // Pipe React's rendered output through our PassThrough
      pipe(passThrough);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
