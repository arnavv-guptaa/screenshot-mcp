#!/usr/bin/env node

/**
 * MCP Screenshot Tool - Enhanced Version
 * 
 * This tool provides comprehensive screenshot capture capabilities with advanced features:
 * 
 * 🎯 ENHANCED FEATURES:
 * 
 * 1. ROBUST ELEMENT DETECTION:
 *    - Multiple fallback strategies for element finding
 *    - Semantic locators (getByRole, getByText, getByLabel)
 *    - Intelligent selector parsing and fixing
 *    - Error recovery with debugging screenshots
 *    - Strategy logging for troubleshooting
 *    
 * 2. COMPREHENSIVE PAGE ANALYSIS:
 *    - Extracts links, buttons, forms, and navigation elements
 *    - Properly returns analysis data in MCP format
 *    - Identifies interactive elements for automation
 *    - Analyzes page structure and scrollable content
 *    
 * 3. ADVANCED INTERACTIONS:
 *    - Click, hover, scroll, fill, and select operations
 *    - Automatic waiting for elements to be ready
 *    - Error handling with continuation of remaining interactions
 *    - Screenshot capture after each interaction
 *    
 * 4. AUTHENTICATION SUPPORT:
 *    - Automatic login with credentials
 *    - Session persistence across requests
 *    - Configurable login selectors
 *    
 * 5. MULTI-PAGE NAVIGATION:
 *    - Follow links across multiple pages
 *    - Configurable depth and exclusion patterns
 *    - Screenshot capture for each visited page
 *    
 * 6. INTELLIGENT SCREENSHOT CAPTURE:
 *    - Smart scroll detection and capture
 *    - Full-page and viewport-based screenshots
 *    - Optimized for dynamic content loading
 *    
 * Usage Examples:
 * 
 * Basic screenshot:
 * { "url": "https://example.com" }
 * 
 * With page analysis:
 * { "url": "https://example.com", "pageAnalysis": true }
 * 
 * With interactions:
 * { 
 *   "url": "https://example.com",
 *   "interactions": [
 *     { "action": "click", "selector": ".menu-button", "screenshot": true },
 *     { "action": "fill", "selector": "#search", "value": "test query" }
 *   ]
 * }
 * 
 * With login:
 * {
 *   "url": "https://example.com",
 *   "loginCredentials": {
 *     "username": "user@example.com",
 *     "password": "password123"
 *   }
 * }
 */

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
                username: {
                  type: 'string',
                  description: 'Username or email'
                },
                password: {
                  type: 'string',
                  description: 'Password'
                },
                loginUrl: {
                  type: 'string',
                  description: 'URL of the login page'
                },
                usernameSelector: {
                  type: 'string',
                  description: 'CSS selector for username field',
                  default: 'input[type="email"], input[name*="email"], input[name*="username"]'
                },
                passwordSelector: {
                  type: 'string',
                  description: 'CSS selector for password field',
                  default: 'input[type="password"]'
                },
                submitSelector: {
                  type: 'string',
                  description: 'CSS selector for submit button',
                  default: 'button[type="submit"], input[type="submit"]'
                }
              }
            },
            pageAnalysis: {
              type: 'boolean',
              description: 'Extract page structure, links, and interactive elements for AI analysis',
              default: false
            },
            interactions: {
              type: 'array',
              description: 'Sequence of interactions to perform before screenshots',
              items: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['click', 'hover', 'scroll', 'fill', 'select', 'wait'],
                    description: 'Type of interaction'
                  },
                  selector: {
                    type: 'string',
                    description: 'CSS selector for target element'
                  },
                  value: {
                    type: 'string',
                    description: 'Value to input (for fill/select actions)'
                  },
                  waitFor: {
                    type: 'string',
                    description: 'Element to wait for after action'
                  },
                  screenshot: {
                    type: 'boolean',
                    description: 'Take screenshot after this action',
                    default: false
                  }
                }
              }
            },
            navigationFlow: {
              type: 'object',
              description: 'Multi-page navigation configuration',
              properties: {
                followLinks: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'CSS selectors or text patterns for links to follow'
                },
                maxDepth: {
                  type: 'number',
                  description: 'Maximum navigation depth',
                  default: 2
                },
                excludePatterns: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'URL patterns to exclude from navigation'
                },
                screenshotEachPage: {
                  type: 'boolean',
                  description: 'Take screenshots of each navigated page',
                  default: true
                }
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

  // Handle automatic login
  async handleLogin(page, loginCredentials) {
    const {
      username,
      password,
      loginUrl,
      usernameSelector = 'input[type="email"], input[name*="email"], input[name*="username"]',
      passwordSelector = 'input[type="password"]',
      submitSelector = 'button[type="submit"], input[type="submit"]'
    } = loginCredentials;

    if (!username || !password) {
      throw new Error('Username and password are required for login');
    }

    console.log(`🔐 Attempting login...`);

    try {
      // If loginUrl is provided, navigate to it first
      if (loginUrl) {
        console.log(`🌐 Navigating to login page: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
      }

      // Wait for login form to be present
      await page.waitForSelector(usernameSelector, { timeout: 10000 });
      await page.waitForSelector(passwordSelector, { timeout: 10000 });

      // Fill in username
      console.log(`👤 Filling username field...`);
      await page.fill(usernameSelector, username);
      await page.waitForTimeout(500);

      // Fill in password
      console.log(`🔑 Filling password field...`);
      await page.fill(passwordSelector, password);
      await page.waitForTimeout(500);

      // Submit form
      console.log(`🚀 Submitting login form...`);
      await page.click(submitSelector);

      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);

      // Check if login was successful
      const currentUrl = page.url();
      const isStillOnLoginPage = currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth');
      
      if (isStillOnLoginPage) {
        // Check for error messages
        const errorMessage = await page.evaluate(() => {
          const errorElements = document.querySelectorAll('[class*="error"], [class*="invalid"], [class*="fail"], [role="alert"]');
          return Array.from(errorElements).map(el => el.textContent.trim()).join('; ');
        });
        
        throw new Error(`Login failed: ${errorMessage || 'Still on login page after submission'}`);
      }

      console.log(`✅ Login successful, redirected to: ${currentUrl}`);
      return true;

    } catch (error) {
      console.error(`❌ Login failed: ${error.message}`);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  // Analyze page structure and extract interactive elements
  async analyzePage(page) {
    console.log(`🔍 Analyzing page structure...`);
    
    const analysis = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        selector: a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (a.className ? `.${a.className.split(' ').join('.')}` : '')
      }));
      
      const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).map(btn => ({
        text: btn.textContent.trim() || btn.value || btn.getAttribute('aria-label'),
        selector: btn.tagName.toLowerCase() + (btn.id ? `#${btn.id}` : '') + (btn.className ? `.${btn.className.split(' ').join('.')}` : ''),
        type: btn.type || 'button'
      }));
      
      const forms = Array.from(document.querySelectorAll('form')).map(form => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
          name: input.name,
          type: input.type,
          placeholder: input.placeholder,
          required: input.required
        }))
      }));
      
      const navigation = Array.from(document.querySelectorAll('nav, [role="navigation"], .nav, .navbar, .menu')).map(nav => ({
        links: Array.from(nav.querySelectorAll('a')).map(a => ({
          text: a.textContent.trim(),
          href: a.href
        }))
      }));
      
      return {
        url: window.location.href,
        title: document.title,
        links: links.slice(0, 20), // Limit to prevent overwhelming output
        buttons: buttons.slice(0, 10),
        forms: forms.slice(0, 5),
        navigation: navigation.slice(0, 3),
        hasModal: !!document.querySelector('[role="dialog"], .modal, .popup'),
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        viewportHeight: window.innerHeight
      };
    });
    
    console.log(`📊 Page analysis complete: ${analysis.links.length} links, ${analysis.buttons.length} buttons, ${analysis.forms.length} forms`);
    return analysis;
  }

  // Robust element finder with multiple fallback strategies
  async findElement(page, interaction) {
    const { selector, action, value } = interaction;
    console.log(`🔍 Finding element for ${action} with selector: ${selector}`);
    
    // Strategy 1: Try the provided selector as-is
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      return { locator: page.locator(selector), strategy: 'direct-selector' };
    } catch (e) {
      console.log(`⚠️ Direct selector failed: ${e.message}`);
    }

    // Strategy 2: Try semantic locators based on the selector
    const semanticStrategies = [
      // Try by role and text
      () => {
        if (interaction.action === 'click' && value) {
          return page.getByRole('button', { name: new RegExp(value, 'i') });
        }
        return null;
      },
      
      // Try by text content
      () => {
        if (value) {
          return page.getByText(new RegExp(value, 'i'));
        }
        return null;
      },
      
      // Try by label (for form elements)
      () => {
        if ((interaction.action === 'fill' || interaction.action === 'select') && value) {
          return page.getByLabel(new RegExp(value, 'i'));
        }
        return null;
      },
      
      // Try by placeholder
      () => {
        if (interaction.action === 'fill' && value) {
          return page.getByPlaceholder(new RegExp(value, 'i'));
        }
        return null;
      },
      
      // Try common button patterns
      () => {
        if (interaction.action === 'click') {
          const buttonPatterns = [
            'button',
            '[role="button"]',
            'input[type="button"]',
            'input[type="submit"]',
            '.btn',
            '.button'
          ];
          
          for (const pattern of buttonPatterns) {
            try {
              return page.locator(pattern).first();
            } catch (e) {
              continue;
            }
          }
        }
        return null;
      },
      
      // Try by data-testid patterns
      () => {
        const testIdPatterns = [
          `[data-testid*="${selector}"]`,
          `[data-test*="${selector}"]`,
          `[data-cy*="${selector}"]`
        ];
        
        for (const pattern of testIdPatterns) {
          try {
            return page.locator(pattern);
          } catch (e) {
            continue;
          }
        }
        return null;
      },
      
      // Try by aria-label
      () => {
        if (value) {
          return page.locator(`[aria-label*="${value}" i]`);
        }
        return null;
      },
      
      // Try by title attribute
      () => {
        if (value) {
          return page.locator(`[title*="${value}" i]`);
        }
        return null;
      }
    ];

    // Try each semantic strategy
    for (let i = 0; i < semanticStrategies.length; i++) {
      try {
        const locator = semanticStrategies[i]();
        if (locator) {
          await locator.waitFor({ timeout: 3000 });
          console.log(`✅ Found element using strategy ${i + 1}`);
          return { locator, strategy: `semantic-${i + 1}` };
        }
      } catch (e) {
        continue;
      }
    }

    // Strategy 3: Try to parse and fix the selector
    const selectorFixStrategies = [
      // Remove complex chaining and try just the last part
      () => {
        const parts = selector.split(' ');
        return parts[parts.length - 1];
      },
      
      // Try without class names (just tag + id)
      () => {
        const match = selector.match(/^(\w+)(#[\w-]+)/);
        return match ? match[0] : null;
      },
      
      // Try just the ID if present
      () => {
        const match = selector.match(/#([\w-]+)/);
        return match ? `#${match[1]}` : null;
      },
      
      // Try just the tag name
      () => {
        const match = selector.match(/^(\w+)/);
        return match ? match[1] : null;
      },
      
      // Try to find by common class patterns
      () => {
        const commonClasses = ['.btn', '.button', '.link', '.nav', '.menu', '.form', '.input'];
        for (const cls of commonClasses) {
          if (selector.includes(cls.substring(1))) {
            return cls;
          }
        }
        return null;
      }
    ];

    // Try each fix strategy
    for (let i = 0; i < selectorFixStrategies.length; i++) {
      try {
        const fixedSelector = selectorFixStrategies[i]();
        if (fixedSelector) {
          await page.waitForSelector(fixedSelector, { timeout: 3000 });
          console.log(`✅ Found element using fixed selector: ${fixedSelector}`);
          return { locator: page.locator(fixedSelector), strategy: `fixed-${i + 1}` };
        }
      } catch (e) {
        continue;
      }
    }

    throw new Error(`❌ Could not find element with selector: ${selector}`);
  }

  // Enhanced element interactions with robust finding
  async performInteractions(page, interactions) {
    if (!interactions || interactions.length === 0) return [];
    
    console.log(`🎯 Performing ${interactions.length} interactions...`);
    const screenshots = [];
    
    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      console.log(`🔄 Interaction ${i + 1}: ${interaction.action} ${interaction.selector || ''}`);
      
      try {
        if (interaction.action === 'wait') {
          await page.waitForTimeout(parseInt(interaction.value) || 2000);
          continue;
        }

        // Find the element using robust strategies
        const { locator, strategy } = await this.findElement(page, interaction);
        console.log(`🎯 Using strategy: ${strategy}`);
        
        switch (interaction.action) {
          case 'click':
            await locator.click();
            break;
            
          case 'hover':
            await locator.hover();
            break;
            
          case 'scroll':
            if (interaction.selector) {
              await locator.scrollIntoViewIfNeeded();
            } else {
              await page.evaluate((value) => {
                window.scrollTo({ top: parseInt(value) || 0, behavior: 'smooth' });
              }, interaction.value);
            }
            break;
            
          case 'fill':
            await locator.fill(interaction.value || '');
            break;
            
          case 'select':
            await locator.selectOption(interaction.value || '');
            break;
        }
        
        // Wait for specified element if provided
        if (interaction.waitFor) {
          try {
            await page.waitForSelector(interaction.waitFor, { timeout: 10000 });
          } catch (e) {
            console.warn(`⚠️ WaitFor element not found: ${interaction.waitFor}`);
          }
        }
        
        // Wait for any animations/transitions
        await page.waitForTimeout(1000);
        
        // Take screenshot if requested
        if (interaction.screenshot) {
          await this.waitForContent(page);
          const screenshot = await page.screenshot({ type: 'png', fullPage: false });
          screenshots.push({
            type: 'image',
            mimeType: 'image/png',
            data: screenshot.toString('base64'),
            name: `interaction_${i + 1}_${interaction.action}.png`
          });
        }
        
        console.log(`✅ Interaction ${i + 1} completed successfully`);
        
      } catch (error) {
        console.error(`❌ Interaction ${i + 1} failed: ${error.message}`);
        
        // Take error screenshot for debugging
        try {
          const errorScreenshot = await page.screenshot({ type: 'png', fullPage: false });
          screenshots.push({
            type: 'image',
            mimeType: 'image/png',
            data: errorScreenshot.toString('base64'),
            name: `error_interaction_${i + 1}_${interaction.action}.png`
          });
        } catch (screenshotError) {
          console.warn(`⚠️ Could not take error screenshot: ${screenshotError.message}`);
        }
        
        // Continue with next interaction instead of stopping
        continue;
      }
    }
    
    console.log(`✅ Completed ${interactions.length} interactions (with robust element detection)`);
    return screenshots;
  }

  // Navigate through multiple pages
  async navigatePages(page, navigationFlow, baseUrl) {
    if (!navigationFlow || !navigationFlow.followLinks) return [];
    
    console.log(`🧭 Starting navigation flow...`);
    const visitedUrls = new Set();
    const screenshots = [];
    const maxDepth = navigationFlow.maxDepth || 2;
    const excludePatterns = navigationFlow.excludePatterns || [];
    
    const navigate = async (currentUrl, depth) => {
      if (depth > maxDepth || visitedUrls.has(currentUrl)) return;
      
      // Check exclude patterns
      if (excludePatterns.some(pattern => currentUrl.includes(pattern))) {
        console.log(`🚫 Skipping excluded URL: ${currentUrl}`);
        return;
      }
      
      console.log(`🌐 Navigating to: ${currentUrl} (depth: ${depth})`);
      visitedUrls.add(currentUrl);
      
      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        await this.waitForContent(page);
        
        // Take screenshot if requested
        if (navigationFlow.screenshotEachPage) {
          const urlObj = new URL(currentUrl);
          const baseName = this.generateBaseName(urlObj);
          const screenshot = await page.screenshot({ type: 'png', fullPage: true });
          screenshots.push({
            type: 'image',
            mimeType: 'image/png',
            data: screenshot.toString('base64'),
            name: `nav_${depth}_${baseName}.png`
          });
        }
        
        // Find links to follow
        const links = await page.evaluate((selectors) => {
          const foundLinks = [];
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const href = el.href || el.getAttribute('href');
              if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                foundLinks.push(href);
              }
            });
          });
          return [...new Set(foundLinks)]; // Remove duplicates
        }, navigationFlow.followLinks);
        
        // Navigate to found links
        for (const link of links.slice(0, 5)) { // Limit to prevent infinite loops
          await navigate(link, depth + 1);
        }
        
      } catch (error) {
        console.error(`❌ Navigation failed for ${currentUrl}: ${error.message}`);
      }
    };
    
    await navigate(baseUrl, 0);
    console.log(`✅ Navigation complete. Visited ${visitedUrls.size} pages`);
    return screenshots;
  }

  // Comprehensive screenshot capture logic
  async captureScreenshots(page, url, options = {}) {
    const {
      scrollScreenshots = true,
      fullPage = true,
      loginCredentials = null,
      pageAnalysis = false,
      interactions = null,
      navigationFlow = null
    } = options;

    const screenshots = [];
    let pageAnalysisData = null;
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
          
          // If login credentials are provided, attempt login
          if (loginCredentials && loginCredentials.username && loginCredentials.password) {
            try {
              await this.handleLogin(page, loginCredentials);
              
              // After successful login, navigate to original URL
              console.log(`🌐 Navigating to original URL after login: ${url}`);
              await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
              await page.waitForTimeout(2000);
              await this.waitForContent(page);
              
              // Continue with normal screenshot capture
              console.log(`✅ Login successful, proceeding with screenshots`);
            } catch (loginError) {
              console.error(`❌ Login failed: ${loginError.message}`);
              // Take screenshot of login failure
              screenshots.push({
                type: 'image',
                mimeType: 'image/png',
                data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
                name: `${baseName}_login_failed.png`
              });
              throw new Error(`Login failed: ${loginError.message}`);
            }
          } else {
            // No login credentials provided, just capture login page
            console.log(`ℹ️ No login credentials provided, capturing login page`);
            screenshots.push({
              type: 'image',
              mimeType: 'image/png',
              data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
              name: `${baseName}_login_page.png`
            });
            return {
              screenshots,
              pageAnalysis: pageAnalysisData,
              status: 'login_required'
            };
          }
        } else if (isErrorPage) {
          console.log(`❌ Redirected to error page: ${currentUrl}`);
                      screenshots.push({
              type: 'image',
              mimeType: 'image/png',
              data: (await page.screenshot({ type: 'png', fullPage: false })).toString('base64'),
              name: `${baseName}_error_page.png`
            });
            return {
              screenshots,
              pageAnalysis: pageAnalysisData,
              status: 'error_page'
            };
        } else {
          console.log(`ℹ️ Redirected to: ${currentUrl} (proceeding with screenshots)`);
        }
      }

      // Page analysis if requested
      if (pageAnalysis) {
        pageAnalysisData = await this.analyzePage(page);
        console.log(`📋 Page analysis data:`, JSON.stringify(pageAnalysisData, null, 2));
      }

      // Perform interactions if provided
      if (interactions && interactions.length > 0) {
        const interactionScreenshots = await this.performInteractions(page, interactions);
        screenshots.push(...interactionScreenshots);
      }

      // Navigation flow if provided
      if (navigationFlow && navigationFlow.followLinks) {
        const navigationScreenshots = await this.navigatePages(page, navigationFlow, page.url());
        screenshots.push(...navigationScreenshots);
        
        // Return early if navigation flow handled screenshots
        if (navigationScreenshots.length > 0) {
          return {
            screenshots,
            pageAnalysis: pageAnalysisData
          };
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

    // Return screenshots with optional page analysis data
    return {
      screenshots,
      pageAnalysis: pageAnalysisData
    };
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
        const pageAnalysis = args.pageAnalysis === true;
        const interactions = args.interactions || null;
        const navigationFlow = args.navigationFlow || null;
        
        if (!url) {
          this.sendResponse(request.id, null, {
            code: -32602,
            message: 'URL is required'
          });
          return;
        }

        console.log(`📸 Starting comprehensive screenshot capture for: ${url}`);
        if (loginCredentials && loginCredentials.username) {
          console.log(`🔐 Login credentials provided for user: ${loginCredentials.username}`);
        }
        if (pageAnalysis) {
          console.log(`🔍 Page analysis requested`);
        }
        if (interactions) {
          console.log(`🎯 ${interactions.length} interactions requested`);
        }
        if (navigationFlow) {
          console.log(`🧭 Navigation flow requested`);
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
          const result = await this.captureScreenshots(page, url, {
            scrollScreenshots,
            fullPage,
            loginCredentials,
            pageAnalysis,
            interactions,
            navigationFlow
          });
          
          await page.close();
          await context.close();
          await browser.close();
          
          // Handle different return formats
          let screenshots, analysisData;
          if (result && result.screenshots) {
            // New format with analysis data
            screenshots = result.screenshots;
            analysisData = result.pageAnalysis;
          } else {
            // Legacy format (just screenshots array)
            screenshots = result;
          }
          
          console.log(`✅ Captured ${screenshots.length} screenshots successfully`);
          
          // Return results in MCP format
          const response = {
            content: screenshots
          };
          
          // Include page analysis data if available
          if (analysisData) {
            console.log(`📊 Including page analysis data in response`);
            // Add page analysis as a text content item
            response.content.push({
              type: 'text',
              text: `# Page Analysis\n\n${JSON.stringify(analysisData, null, 2)}`
            });
          }
          
          this.sendResponse(request.id, response);
          
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