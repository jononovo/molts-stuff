import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { PassThrough } from "stream";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const serverPath = path.resolve(__dirname, "server");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static assets
  app.use(express.static(distPath));

  // Load the HTML template
  const templatePath = path.resolve(distPath, "index.html");
  const template = fs.readFileSync(templatePath, "utf-8");
  const [htmlStart, htmlEnd] = template.split("<!--ssr-outlet-->");

  // SSR handler for all routes
  app.use("/{*path}", async (req, res, next) => {
    try {
      // Import the server bundle
      const { render } = await import(
        path.resolve(serverPath, "entry-server.js")
      );

      const url = req.originalUrl;

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
        next(err);
      });

      // Pipe React's rendered output through our PassThrough
      pipe(passThrough);
    } catch (e) {
      next(e);
    }
  });
}
