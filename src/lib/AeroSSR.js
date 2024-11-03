const http = require('http');
const fs = require('fs').promises;
const url = require('url');
const path = require('path');
const crypto = require('crypto');

class AeroSSR {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3000,
      cacheMaxAge: config.cacheMaxAge || 3600,
      corsOrigins: config.corsOrigins || '*',
      compression: config.compression !== false,
      bundleCache: new Map(),
      templateCache: new Map(),
      defaultMeta: {
        title: 'AeroSSR App',
        description: 'Built with AeroSSR bundler',
        charset: 'UTF-8',
        viewport: 'width=device-width, initial-scale=1.0',
      },
      ...config
    };

    this.server = null;
    this.routes = new Map();
    this.middlewares = [];
  }

  // Middleware handler
  use(middleware) {
    this.middlewares.push(middleware);
  }

  // Route registration
  route(path, handler) {
    this.routes.set(path, handler);
  }

  // Cache management
  clearCache() {
    this.config.bundleCache.clear();
    this.config.templateCache.clear();
  }

  // Generate ETag for content
  generateETag(content) {
    return crypto
      .createHash('md5')
      .update(content)
      .digest('hex');
  }

  // CORS headers setup
  setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', this.config.corsOrigins);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Inject meta tags and scripts
  injectMetaTags(html, meta = {}) {
    const finalMeta = { ...this.config.defaultMeta, ...meta };
    
    const metaTags = `
      <meta charset="${finalMeta.charset}">
      <meta name="viewport" content="${finalMeta.viewport}">
      <meta name="description" content="${finalMeta.description}">
      <title>${finalMeta.title}</title>
    `;

    return html.replace('</head>', `${metaTags}</head>`);
  }

  // Bundle generation with caching
  async generateBundle(projectPath, entryPoint, force = false) {
    const cacheKey = `${projectPath}:${entryPoint}`;
    
    if (!force && this.config.bundleCache.has(cacheKey)) {
      return this.config.bundleCache.get(cacheKey);
    }

    try {
      const entryFilePath = path.join(projectPath, entryPoint);
      const dependencies = await this.resolveDependencies(entryFilePath);
      
      let bundle = '';
      for (const dep of dependencies) {
        const content = await fs.readFile(dep, 'utf-8');
        bundle += `\n// File: ${path.relative(projectPath, dep)}\n${content}\n`;
      }

      // Basic minification
      bundle = this.minifyBundle(bundle);
      
      this.config.bundleCache.set(cacheKey, bundle);
      return bundle;
    } catch (error) {
      throw new Error(`Bundle generation failed: ${error.message}`);
    }
  }

  // Simple minification
  minifyBundle(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '') // Remove comments
      .replace(/\s+/g, ' ') // Reduce multiple spaces to single space
      .replace(/^\s+|\s+$/gm, ''); // Trim line starts and ends
  }

  // Dependency resolution
  async resolveDependencies(filePath, deps = new Set()) {
    if (deps.has(filePath)) return deps;
    
    deps.add(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Simple require/import detection
    const importMatches = content.match(/(?:require|import)\s*\(['"]([^'"]+)['"]\)/g);
    
    if (importMatches) {
      for (const match of importMatches) {
        const depPath = match.match(/['"]([^'"]+)['"]/)[1];
        const fullPath = path.resolve(path.dirname(filePath), depPath);
        
        if (fullPath.endsWith('.js')) {
          await this.resolveDependencies(fullPath, deps);
        }
      }
    }
    
    return deps;
  }

  // Error handling middleware
  async handleError(error, req, res) {
    console.error('Server error:', error);

    const statusCode = error.statusCode || 500;
    const errorPage = await this.generateErrorPage(statusCode, error.message);

    res.writeHead(statusCode, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store'
    });
    res.end(errorPage);
  }

  // Generate error page
  async generateErrorPage(statusCode, message) {
    const errorTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error ${statusCode}</title>
          <style>
            body { font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 1rem; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Error ${statusCode}</h1>
          <div class="error">
            <p>${message}</p>
          </div>
        </body>
      </html>
    `;
    return errorTemplate;
  }

  // Request handler
  async handleRequest(req, res) {
    try {
      // Run middlewares
      for (const middleware of this.middlewares) {
        await middleware(req, res);
      }

      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      // Handle OPTIONS requests
      if (req.method === 'OPTIONS') {
        this.setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
      }

      // Check for registered route handlers
      if (this.routes.has(pathname)) {
        const handler = this.routes.get(pathname);
        await handler(req, res);
        return;
      }

      if (pathname === '/dist') {
        const projectPath = parsedUrl.query.projectPath || './src';
        const entryPoint = parsedUrl.query.entryPoint || 'main.js';
        const force = parsedUrl.query.force === 'true';

        const bundle = await this.generateBundle(projectPath, entryPoint, force);
        const etag = this.generateETag(bundle);

        // Check if-none-match
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304);
          res.end();
          return;
        }

        this.setCorsHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': `public, max-age=${this.config.cacheMaxAge}`,
          'ETag': etag
        });
        res.end(bundle);

      } else if (pathname.startsWith('/src/') && pathname.endsWith('.js')) {
        const filePath = path.join(process.cwd(), pathname);
        const content = await fs.readFile(filePath);
        const etag = this.generateETag(content);

        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304);
          res.end();
          return;
        }

        this.setCorsHeaders(res);
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': `public, max-age=${this.config.cacheMaxAge}`,
          'ETag': etag
        });
        res.end(content);

      } else {
        const htmlPath = path.join(__dirname, 'index.html');
        let html = await fs.readFile(htmlPath, 'utf-8');

        const meta = {
          title: `Page - ${pathname}`,
          description: `Content for ${pathname}`
        };

        html = this.injectMetaTags(html, meta);

        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache'
        });
        res.end(html);
      }

    } catch (error) {
      await this.handleError(error, req, res);
    }
  }

  // Start the server
  start() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    
    this.server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });

    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`AeroSSR server running on port ${this.config.port}`);
        resolve(this.server);
      });
    });
  }

  // Stop the server
  stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Server stopped');
          resolve();
        });
      });
    }
    return Promise.resolve();
  }
}

module.exports = AeroSSR