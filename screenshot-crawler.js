const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

class EnhancedWebsiteScreenshotter {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.baseDomain = new URL(baseUrl).hostname;
    this.visitedUrls = new Set();
    this.screenshotCount = 0;
    
    // Configuration options
    this.options = {
      maxPages: options.maxPages || 50,
      delay: options.delay || 2000,
      outputDir: options.outputDir || './screenshots',
      fullPage: options.fullPage !== false,
      viewport: options.viewport || { width: 1920, height: 1080 },
      
      // Enhanced options for scroll-based screenshots
      scrollScreenshots: options.scrollScreenshots !== false, // Enable scroll screenshots
      scrollDelay: options.scrollDelay || 1500, // Wait after each scroll
      scrollStep: options.scrollStep || 800, // Pixels to scroll each time
      maxScrollScreenshots: options.maxScrollScreenshots || 10, // Max screenshots per page
      waitForAnimations: options.waitForAnimations !== false,
      
      excludePatterns: options.excludePatterns || [
        '/login', '/signin', '/sign-in', '/auth', '/register', '/signup', '/sign-up',
        '/logout', '/admin', '/dashboard', '/profile', '/account', '/settings',
        '/api/', '/.', '#', 'mailto:', 'tel:', 'javascript:'
      ],
      includePatterns: options.includePatterns || [],
      timeout: options.timeout || 30000,
      ...options
    };
  }

  async init() {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    this.browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.context = await this.browser.newContext({
      viewport: this.options.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  shouldVisitUrl(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      const fullUrl = urlObj.href;
      
      if (this.visitedUrls.has(fullUrl)) return false;
      if (urlObj.hostname !== this.baseDomain) return false;
      
      const pathAndSearch = urlObj.pathname + urlObj.search;
      for (const pattern of this.options.excludePatterns) {
        if (pathAndSearch.includes(pattern)) return false;
      }
      
      if (this.options.includePatterns.length > 0) {
        const matchesInclude = this.options.includePatterns.some(pattern => 
          pathAndSearch.includes(pattern)
        );
        if (!matchesInclude && urlObj.pathname !== '/') return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  async extractLinks(page) {
    return await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .map(link => link.href)
        .filter(href => href && !href.startsWith('javascript:'));
    });
  }

  async waitForContent(page) {
    // Wait for common lazy loading indicators to disappear
    try {
      await page.waitForFunction(() => {
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="skeleton"]');
        return loadingElements.length === 0 || Array.from(loadingElements).every(el => 
          getComputedStyle(el).display === 'none' || getComputedStyle(el).opacity === '0'
        );
      }, { timeout: 5000 });
    } catch (e) {
      // Continue if no loading indicators found
    }

    // Wait for images to load
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every(img => img.complete);
    }, { timeout: 10000 }).catch(() => {});

    // Wait for any animations
    if (this.options.waitForAnimations) {
      await page.waitForTimeout(1000);
    }
  }

  async takeScrollScreenshots(page, url) {
    const urlObj = new URL(url);
    const baseName = this.generateBaseName(urlObj);
    const screenshots = [];

    try {
      console.log(`📸 Taking scroll-based screenshots for: ${url}`);

      // Reset scroll position
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.waitForContent(page);

      // Get page dimensions
      const pageInfo = await page.evaluate(() => ({
        scrollHeight: document.body.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      console.log(`📏 Page dimensions: ${pageInfo.scrollWidth}x${pageInfo.scrollHeight}`);

      let currentScroll = 0;
      let screenshotIndex = 0;
      const maxScroll = pageInfo.scrollHeight - pageInfo.clientHeight;

      // Take initial screenshot (top of page)
      const topFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_scroll_${String(screenshotIndex).padStart(2, '0')}_top.png`;
      const topFilepath = path.join(this.options.outputDir, topFilename);
      
      await page.screenshot({
        path: topFilepath,
        type: 'png',
        fullPage: false // Take viewport screenshot
      });
      
      screenshots.push(topFilename);
      this.screenshotCount++;
      screenshotIndex++;
      console.log(`✅ Screenshot saved: ${topFilename}`);

      // Scroll and take screenshots
      while (currentScroll < maxScroll && screenshotIndex < this.options.maxScrollScreenshots) {
        // Scroll down
        currentScroll = Math.min(currentScroll + this.options.scrollStep, maxScroll);
        
        await page.evaluate((scrollY) => {
          window.scrollTo({ top: scrollY, behavior: 'smooth' });
        }, currentScroll);

        // Wait for scroll to complete and content to load
        await page.waitForTimeout(this.options.scrollDelay);
        await this.waitForContent(page);

        // Take screenshot
        const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_scroll_${String(screenshotIndex).padStart(2, '0')}_${currentScroll}px.png`;
        const filepath = path.join(this.options.outputDir, filename);
        
        await page.screenshot({
          path: filepath,
          type: 'png',
          fullPage: false
        });
        
        screenshots.push(filename);
        this.screenshotCount++;
        screenshotIndex++;
        console.log(`✅ Screenshot saved: ${filename} (scroll: ${currentScroll}px)`);
      }

      // Take full page screenshot as well
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      
      const fullPageFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_fullpage.png`;
      const fullPageFilepath = path.join(this.options.outputDir, fullPageFilename);
      
      await page.screenshot({
        path: fullPageFilepath,
        type: 'png',
        fullPage: true
      });
      
      screenshots.push(fullPageFilename);
      this.screenshotCount++;
      console.log(`✅ Full page screenshot saved: ${fullPageFilename}`);

      return screenshots;

    } catch (error) {
      console.error(`❌ Failed to take scroll screenshots for ${url}:`, error.message);
      return screenshots;
    }
  }

  async takeStandardScreenshot(page, url) {
    try {
      const urlObj = new URL(url);
      const filename = this.generateFilename(urlObj);
      const filepath = path.join(this.options.outputDir, filename);
      
      console.log(`📸 Taking standard screenshot: ${url}`);
      
      await page.screenshot({
        path: filepath,
        fullPage: this.options.fullPage,
        type: 'png'
      });
      
      this.screenshotCount++;
      console.log(`✅ Screenshot saved: ${filename}`);
      
      return filename;
    } catch (error) {
      console.error(`❌ Failed to screenshot ${url}:`, error.message);
      return null;
    }
  }

  generateBaseName(urlObj) {
    let name = urlObj.pathname === '/' ? 'homepage' : urlObj.pathname;
    
    name = name
      .replace(/^\/+|\/+$/g, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    
    return name || 'page';
  }

  generateFilename(urlObj, suffix = '') {
    const baseName = this.generateBaseName(urlObj);
    const timestamp = Date.now();
    return `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}${suffix}_${timestamp}.png`;
  }

  async crawlAndScreenshot(startUrl = this.baseUrl, depth = 0, maxDepth = 3) {
    if (depth > maxDepth || this.visitedUrls.size >= this.options.maxPages) {
      return;
    }

    if (!this.shouldVisitUrl(startUrl)) {
      return;
    }

    const page = await this.context.newPage();
    
    try {
      console.log(`🌐 Visiting: ${startUrl} (depth: ${depth})`);
      
      this.visitedUrls.add(startUrl);
      
      // Navigate to page
      await page.goto(startUrl, { 
        waitUntil: 'networkidle',
        timeout: this.options.timeout 
      });
      
      // Wait for initial content
      await page.waitForTimeout(this.options.delay);
      await this.waitForContent(page);
      
      // Take screenshots based on configuration
      if (this.options.scrollScreenshots) {
        await this.takeScrollScreenshots(page, startUrl);
      } else {
        await this.takeStandardScreenshot(page, startUrl);
      }
      
      // Extract links for further crawling
      if (depth < maxDepth) {
        const links = await this.extractLinks(page);
        console.log(`🔗 Found ${links.length} links on ${startUrl}`);
        
        for (const link of links) {
          if (this.visitedUrls.size >= this.options.maxPages) break;
          
          if (this.shouldVisitUrl(link)) {
            await this.crawlAndScreenshot(link, depth + 1, maxDepth);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${startUrl}:`, error.message);
    } finally {
      await page.close();
    }
  }

  async run() {
    console.log(`🚀 Starting enhanced screenshot crawl for: ${this.baseUrl}`);
    console.log(`📁 Screenshots will be saved to: ${this.options.outputDir}`);
    console.log(`📜 Scroll screenshots: ${this.options.scrollScreenshots ? 'Enabled' : 'Disabled'}`);
    
    await this.init();
    
    try {
      await this.crawlAndScreenshot();
      
      console.log(`\n✨ Crawl completed!`);
      console.log(`📊 Total screenshots taken: ${this.screenshotCount}`);
      console.log(`🌐 Total pages visited: ${this.visitedUrls.size}`);
      console.log(`📁 Screenshots saved to: ${this.options.outputDir}`);
      
    } catch (error) {
      console.error('❌ Crawl failed:', error);
    } finally {
      await this.close();
    }
  }
}

// Usage function
async function screenshotWebsite(url, options = {}) {
  const crawler = new EnhancedWebsiteScreenshotter(url, options);
  await crawler.run();
}

// Example usage
async function main() {
  const websiteUrl = process.argv[2] || 'https://example.com';
  
  const options = {
    maxPages: 10,               // Maximum pages to screenshot
    delay: 3000,               // Initial wait time (ms)
    outputDir: './screenshots',
    viewport: { width: 1920, height: 1080 },
    
    // Scroll screenshot options
    scrollScreenshots: true,    // Enable scroll-based screenshots
    scrollDelay: 2000,         // Wait after each scroll (ms)
    scrollStep: 800,           // Pixels to scroll each time
    maxScrollScreenshots: 8,   // Max scroll screenshots per page
    waitForAnimations: true,   // Wait for animations to complete
    
    excludePatterns: [
      '/login', '/signin', '/auth', '/register', '/signup',
      '/logout', '/admin', '/dashboard', '/profile', '/account',
      '/api/', '/.well-known/', '/sitemap', '.pdf', '.zip'
    ]
  };
  
  await screenshotWebsite(websiteUrl, options);
}

// Export for use as module
module.exports = { EnhancedWebsiteScreenshotter, screenshotWebsite };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}