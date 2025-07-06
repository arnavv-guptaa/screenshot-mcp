#!/usr/bin/env node

const { chromium } = require('playwright');

// MCP Screenshot Server implementation
class MCPScreenshotServer {
  constructor() {
    this.tools = {
      screenshot: {
        name: 'screenshot',
        description: 'Capture comprehensive screenshots of a web page including scroll-based captures and return them as images',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the page to capture (e.g., /features or full URL)'
            },
            scrollScreenshots: {
              type: 'boolean',
              description: 'Capture scroll-based screenshots (default: true)',
              default: true
            },
            fullPage: {
              type: 'boolean',
              description: 'Capture full page screenshot (default: true)',
              default: true
            },
            viewport: {
              type: 'object',
              description: 'Viewport dimensions',
              properties: {
                width: { type: 'number', default: 1920 },
                height: { type: 'number', default: 1080 }
              }
            },
            loginCredentials: {
              type: 'object',
              description: 'Login credentials if authentication is required',
              properties: {
                loginUrl: { type: 'string', description: 'URL of the login page' },
                username: { type: 'string', description: 'Username or email' },
                password: { type: 'string', description: 'Password' },
                usernameSelector: { type: 'string', description: 'CSS selector for username field', default: 'input[type="email"], input[name*="email"], input[name*="username"]' },
                passwordSelector: { type: 'string', description: 'CSS selector for password field', default: 'input[type="password"]' },
                submitSelector: { type: 'string', description: 'CSS selector for submit button', default: 'button[type="submit"], input[type="submit"]' }
              }
            }
          },
          required: ['url']
        }
      }
    };
  }

  // Send JSON-RPC response
  sendResponse(id, result, error = null) {
    const response = {
      jsonrpc: '2.0',
      id
    };
    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }
    console.log(JSON.stringify(response));
  }

  // Handle initialize request
  handleInitialize(request) {
    const response = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'screenshot-mcp-server',
        version: '2.0.0'
      }
    };
    this.sendResponse(request.id, response);
  }

  // Handle tools/list request
  handleToolsList(request) {
    const tools = Object.values(this.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
    this.sendResponse(request.id, { tools });
  }

  // Generate base name from URL
  generateBaseName(urlObj) {
    let name = urlObj.pathname === '/' ? 'homepage' : urlObj.pathname;
    
    name = name
      .replace(/^\/+|\/+$/g, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    
    if (urlObj.search) {
      const queryString = urlObj.search.substring(1)
        .replace(/[^a-zA-Z0-9_=&-]/g, '_')
        .substring(0, 30);
      name += '_' + queryString;
    }
    
    return name || 'page';
  }

  // Wait for content to load properly
  async waitForContent(page) {
    try {
      // Wait for loading indicators to disappear
      await page.waitForFunction(() => {
        const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="skeleton"], [class*="placeholder"]');
        return loadingElements.length === 0 || Array.from(loadingElements).every(el => 
          getComputedStyle(el).display === 'none' || getComputedStyle(el).opacity === '0'
        );
      }, { timeout: 5000 });
    } catch (e) {}

    try {
      // Wait for images to load
      await page.waitForFunction(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.every(img => img.complete);
      }, { timeout: 8000 });
    } catch (e) {}

    // Additional wait for animations
    await page.waitForTimeout(1000);
  }

  // Handle login when required
  async loginOnPage(page, loginCredentials) {
    if (!loginCredentials || !loginCredentials.username || !loginCredentials.password) {
      console.log('⚠️ No login credentials provided');
      return false;
    }
    
    try {
      console.log(`🔐 Checking current page authentication status...`);
      
      const currentUrl = page.url();
      const currentTitle = await page.title();
      
      console.log(`   Current URL: ${currentUrl}`);
      console.log(`   Current Title: ${currentTitle}`);
      
      // Check if already authenticated
      const authStatus = await page.evaluate(() => {
        const hasLogoutButton = document.querySelector('[href*="logout"], [onclick*="logout"], [class*="logout"], [data-testid*="logout"]');
        const hasUserMenu = document.querySelector('.user-menu, [class*="user-menu"], [class*="profile"], [data-testid*="user"]');
        const hasUserAvatar = document.querySelector('.user-avatar, [class*="avatar"], img[class*="user"]');
        const hasWelcomeMessage = document.body.textContent.toLowerCase().includes('welcome') || 
                                 document.body.textContent.toLowerCase().includes('dashboard');
        
        const isOnLoginPage = 
          window.location.pathname.includes('/login') ||
          window.location.pathname.includes('/signin') ||
          window.location.pathname.includes('/auth') ||
          document.title.toLowerCase().includes('login') ||
          document.title.toLowerCase().includes('sign in') ||
          document.querySelector('input[type="password"]') !== null;
        
        return {
          isAuthenticated: !!(hasLogoutButton || hasUserMenu || hasUserAvatar || hasWelcomeMessage),
          isOnLoginPage,
          hasPasswordField: !!document.querySelector('input[type="password"]'),
          indicators: {
            hasLogoutButton: !!hasLogoutButton,
            hasUserMenu: !!hasUserMenu,
            hasUserAvatar: !!hasUserAvatar,
            hasWelcomeMessage: hasWelcomeMessage
          }
        };
      });
      
      console.log(`   Is On Login Page: ${authStatus.isOnLoginPage}`);
      console.log(`   Is Authenticated: ${authStatus.isAuthenticated}`);
      
      // If already authenticated, no need to login
      if (authStatus.isAuthenticated && !authStatus.isOnLoginPage) {
        console.log('✅ Already authenticated on current page');
        return true;
      }
      
      // If not on login page but also not authenticated, navigate to login
      if (!authStatus.isOnLoginPage && loginCredentials.loginUrl) {
        console.log(`🔐 Navigating to login page: ${loginCredentials.loginUrl}`);
        await page.goto(loginCredentials.loginUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
      }
      
      // Set default selectors if not provided
      const usernameSelector = loginCredentials.usernameSelector || 'input[type="email"], input[name*="email"], input[name*="username"]';
      const passwordSelector = loginCredentials.passwordSelector || 'input[type="password"]';
      const submitSelector = loginCredentials.submitSelector || 'button[type="submit"], input[type="submit"]';
      
      console.log(`🔐 Attempting login on current page...`);
      
      // Check if login form exists
      const loginFormExists = await page.locator(usernameSelector).count() > 0;
      if (!loginFormExists) {
        console.log('⚠️ Login form not found with selector:', usernameSelector);
        return false;
      }
      
      // Fill login form
      console.log(`📝 Filling login form...`);
      await page.fill(usernameSelector, loginCredentials.username);
      await page.fill(passwordSelector, loginCredentials.password);
      
      console.log(`🖱️ Clicking submit button...`);
      await page.click(submitSelector);
      
      // Wait for response
      console.log(`⏳ Waiting for login response...`);
      
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
          page.waitForSelector('.error, [class*="error"], [class*="invalid"]', { timeout: 3000 })
        ]);
      } catch (e) {
        console.log(`⏳ No immediate navigation or error, checking page state...`);
      }
      
      await page.waitForTimeout(2000);
      
      // Verify login success
      const postLoginStatus = await page.evaluate(() => {
        const currentUrl = window.location.href;
        const isStillOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
        
        const errorElements = document.querySelectorAll('.error, [class*="error"], [class*="invalid"], [class*="wrong"]');
        const hasError = errorElements.length > 0 && Array.from(errorElements).some(el => 
          el.textContent.toLowerCase().includes('invalid') || 
          el.textContent.toLowerCase().includes('incorrect') ||
          el.textContent.toLowerCase().includes('wrong')
        );
        
        const hasAuthIndicators = 
          document.querySelector('[href*="logout"], [onclick*="logout"]') ||
          document.querySelector('.user-menu, [class*="user-menu"]') ||
          document.querySelector('.user-avatar, [class*="avatar"]');
        
        return {
          url: currentUrl,
          isStillOnLogin,
          hasError,
          hasAuthIndicators
        };
      });
      
      console.log(`🔍 Post-login verification:`);
      console.log(`   Current URL: ${postLoginStatus.url}`);
      console.log(`   Still on login: ${postLoginStatus.isStillOnLogin}`);
      console.log(`   Has error: ${postLoginStatus.hasError}`);
      console.log(`   Has auth indicators: ${postLoginStatus.hasAuthIndicators}`);
      
      if (postLoginStatus.hasError) {
        console.log('❌ Login failed - error message detected');
        return false;
      }
      
      if (!postLoginStatus.isStillOnLogin || postLoginStatus.hasAuthIndicators) {
        console.log('✅ Login successful');
        return true;
      } else {
        console.log('❌ Login failed - still on login page');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Login error:', error.message);
      return false;
    }
  }

  // Comprehensive screenshot capture logic
  async captureScreenshots(page, url, options = {}) {
    const {
      scrollScreenshots = true,
      fullPage = true,
      loginCredentials = null
    } = options;

    const screenshots = [];
    const urlObj = new URL(page.url());
    const baseName = this.generateBaseName(urlObj);
    const timestamp = Date.now();

    try {
      // Basic navigation check
      const currentUrl = page.url();
      const wasRedirected = !currentUrl.startsWith(url) && !url.startsWith(currentUrl);
      
      if (wasRedirected) {
        const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth');
        const isErrorPage = currentUrl.includes('/error') || currentUrl.includes('/404') || currentUrl.includes('/403');
        
        if (isLoginPage) {
          console.log(`⚠️ Redirected to login page: ${currentUrl}`);
          
          // Attempt login if credentials provided
          if (loginCredentials) {
            console.log(`🔐 Attempting automatic login...`);
            const loginSuccess = await this.loginOnPage(page, loginCredentials);
            if (loginSuccess) {
              console.log(`✅ Login successful, retrying page access...`);
              await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
              await page.waitForTimeout(2000);
              await this.waitForContent(page);
              // Continue with screenshot capture after successful login
            } else {
              console.log(`❌ Login failed`);
              screenshots.push({
                type: 'image',
                mimeType: 'image/png',
                data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
                name: `${baseName}_login_failed.png`
              });
              return screenshots;
            }
          } else {
            console.log(`❌ No login credentials provided for protected page`);
            screenshots.push({
              type: 'image',
              mimeType: 'image/png',
              data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
              name: `${baseName}_login_required.png`
            });
            return screenshots;
          }
        } else if (isErrorPage) {
          console.log(`❌ Redirected to error page: ${currentUrl}`);
          screenshots.push({
            type: 'image',
            mimeType: 'image/png',
            data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
            name: `${baseName}_error_page.png`
          });
          return screenshots;
        } else {
          console.log(`ℹ️ Redirected to: ${currentUrl} (proceeding with screenshots)`);
        }
      }

      // Enhanced scroll-based screenshots
      if (scrollScreenshots) {
        console.log(`📜 Taking scroll-based screenshots...`);
        
        // Reset scroll position
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
        await this.waitForContent(page);

        // Get enhanced page info including scrollable containers
        const pageInfo = await page.evaluate(() => {
          const body = document.body;
          const documentElement = document.documentElement;
          
          // Find the main scrollable container
          const scrollableContainers = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = getComputedStyle(el);
            return (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                   el.scrollHeight > el.clientHeight &&
                   el.clientHeight > 200; // Must be reasonably large
          });
          
          return {
            windowScrollHeight: Math.max(body.scrollHeight, documentElement.scrollHeight),
            windowClientHeight: Math.max(body.clientHeight, documentElement.clientHeight),
            viewportHeight: window.innerHeight,
            hasScrollableContainers: scrollableContainers.length > 0,
            scrollableContainers: scrollableContainers.map(el => ({
              tagName: el.tagName,
              className: el.className,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight
            }))
          };
        });

        console.log(`📊 Page scroll info:`, pageInfo);

        let currentScroll = 0;
        let screenshotIndex = 0;
        const maxScroll = Math.max(
          pageInfo.windowScrollHeight - pageInfo.windowClientHeight,
          pageInfo.windowScrollHeight - pageInfo.viewportHeight
        );

        const scrollStep = 800;
        const maxScrollScreenshots = 10;
        const scrollDelay = 1500;

        console.log(`📏 Scroll range: 0 to ${maxScroll}px`);

        // Take initial screenshot (top of page)
        const topScreenshot = await page.screenshot({ type: 'png', fullPage: false });
        screenshots.push({
          type: 'image',
          mimeType: 'image/png',
          data: topScreenshot.toString('base64'),
          name: `${baseName}_scroll_${screenshotIndex}_top.png`
        });
        console.log(`✅ Top screenshot captured`);
        screenshotIndex++;

        // Take scroll screenshots
        if (maxScroll > 100 || pageInfo.hasScrollableContainers) {
          console.log(`🔄 Scrolling strategy: ${maxScroll > 100 ? 'Window scroll' : 'Container scroll'}`);
          
          let totalScrollSteps = Math.max(
            Math.ceil(maxScroll / scrollStep),
            pageInfo.hasScrollableContainers ? Math.ceil((pageInfo.scrollableContainers[0]?.scrollHeight - pageInfo.scrollableContainers[0]?.clientHeight || 0) / scrollStep) : 0
          );
          
          totalScrollSteps = Math.min(totalScrollSteps, maxScrollScreenshots - 1);
          
          console.log(`📋 Planning ${totalScrollSteps} scroll screenshots`);
          
          for (let step = 1; step <= totalScrollSteps; step++) {
            if (screenshotIndex >= maxScrollScreenshots) break;
            
            // Calculate scroll position
            if (maxScroll > 100) {
              // Use window scrolling
              currentScroll = Math.min((step * scrollStep), maxScroll);
              
              await page.evaluate((scrollY) => {
                window.scrollTo({ top: scrollY, behavior: 'smooth' });
              }, currentScroll);
            } else if (pageInfo.hasScrollableContainers) {
              // Use container scrolling
              const container = pageInfo.scrollableContainers[0];
              const containerMaxScroll = container.scrollHeight - container.clientHeight;
              currentScroll = Math.min((step * scrollStep), containerMaxScroll);
              
              await page.evaluate((params) => {
                const { scrollY } = params;
                const containers = Array.from(document.querySelectorAll('main, [class*="overflow"], [class*="scroll"]')).filter(el => {
                  const style = getComputedStyle(el);
                  return (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                         el.scrollHeight > el.clientHeight;
                });
                
                if (containers.length > 0) {
                  const mainContainer = containers.find(c => c.tagName === 'MAIN') || containers[0];
                  mainContainer.scrollTo({ top: scrollY, behavior: 'smooth' });
                } else {
                  window.scrollTo({ top: scrollY, behavior: 'smooth' });
                }
              }, { scrollY: currentScroll });
            }

            // Wait for scroll to complete and content to load
            await page.waitForTimeout(scrollDelay);
            await this.waitForContent(page);

            const scrollScreenshot = await page.screenshot({ type: 'png', fullPage: false });
            screenshots.push({
              type: 'image',
              mimeType: 'image/png',
              data: scrollScreenshot.toString('base64'),
              name: `${baseName}_scroll_${screenshotIndex}_${currentScroll}px.png`
            });
            console.log(`✅ Scroll screenshot captured (${currentScroll}px)`);
            screenshotIndex++;
          }
        } else {
          console.log(`ℹ️ No significant scroll content detected`);
        }
      }

      // Full page screenshot
      if (fullPage) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
        
        const fullPageScreenshot = await page.screenshot({ type: 'png', fullPage: true });
        screenshots.push({
          type: 'image',
          mimeType: 'image/png',
          data: fullPageScreenshot.toString('base64'),
          name: `${baseName}_fullpage.png`
        });
        console.log(`✅ Full page screenshot captured`);
      }

    } catch (error) {
      console.error(`❌ Failed to capture screenshots:`, error.message);
      throw error;
    }

    return screenshots;
  }

  // Handle tools/call request
  async handleToolsCall(request) {
    const { name, arguments: args } = request.params;
    
    if (name === 'screenshot') {
      try {
        const url = args.url;
        const scrollScreenshots = args.scrollScreenshots !== false;
        const fullPage = args.fullPage !== false;
        const viewport = args.viewport || { width: 1920, height: 1080 };
        const loginCredentials = args.loginCredentials || null;
        
        if (!url) {
          this.sendResponse(request.id, null, {
            code: -32602,
            message: 'URL is required'
          });
          return;
        }

        console.log(`📸 Starting comprehensive screenshot capture for: ${url}`);
        if (loginCredentials) {
          console.log(`🔐 Login credentials provided for authentication`);
        }
        
        // Launch browser and capture screenshots
        let browser;
        try {
          browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          
          const context = await browser.newContext({
            viewport: viewport
          });
          
          const page = await context.newPage();
          
          // Navigate to page
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(2000);
          await this.waitForContent(page);
          
          // Capture comprehensive screenshots
          const screenshots = await this.captureScreenshots(page, url, {
            scrollScreenshots,
            fullPage,
            loginCredentials
          });
          
          await page.close();
          await context.close();
          await browser.close();
          
          console.log(`✅ Captured ${screenshots.length} screenshots successfully`);
          
          // Return screenshots in MCP format
          this.sendResponse(request.id, {
            content: screenshots
          });
          
        } catch (e) {
          if (browser) await browser.close();
          this.sendResponse(request.id, null, {
            code: -32603,
            message: `Screenshot capture failed: ${e.message}`
          });
        }
      } catch (error) {
        this.sendResponse(request.id, null, {
          code: -32603,
          message: `Internal error: ${error.message}`
        });
      }
    } else {
      this.sendResponse(request.id, null, {
        code: -32601,
        message: `Unknown tool: ${name}`
      });
    }
  }

  // Main message handler
  async handleMessage(message) {
    try {
      const request = JSON.parse(message);
      
      switch (request.method) {
        case 'initialize':
          this.handleInitialize(request);
          break;
        case 'tools/list':
          this.handleToolsList(request);
          break;
        case 'tools/call':
          await this.handleToolsCall(request);
          break;
        default:
          this.sendResponse(request.id, null, {
            code: -32601,
            message: `Unknown method: ${request.method}`
          });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      if (error.requestId) {
        this.sendResponse(error.requestId, null, {
          code: -32700,
          message: 'Parse error'
        });
      }
    }
  }

  // Start the server
  start() {
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line);
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });

    process.on('SIGINT', () => {
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.exit(0);
    });
  }
}

// Start the MCP server
const server = new MCPScreenshotServer();
server.start(); 