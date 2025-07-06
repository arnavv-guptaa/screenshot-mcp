#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const axios = require('axios');

// Configuration loader
async function loadConfig(configPath = './screenshot-config.json') {
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.log(`⚠️ No config file found at ${configPath}, using defaults`);
    return {};
  }
}

// AI-Powered Page Analyzer
class AIPageAnalyzer {
  constructor(apiKey, model = 'deepseek/deepseek-chat-v3-0324:free') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://openrouter.ai/api/v1';
  }

  async analyzePageForTabs(page, url) {
    try {
      console.log(`🧠 AI analyzing page for tabs: ${url}`);
      
      // Check if page is still valid before proceeding
      if (page.isClosed()) {
        throw new Error('Target page has been closed');
      }
      
      // Take a screenshot for visual analysis
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
      const screenshotBase64 = screenshotBuffer.toString('base64');
      
      // Get page HTML structure and navigation context
      const pageInfo = await page.evaluate((requestedUrl) => {
        // Get simplified HTML structure focusing on interactive elements
        const getElementInfo = (el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 100) || '',
            className: el.className || '',
            id: el.id || '',
            role: el.getAttribute('role') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            dataAttrs: Array.from(el.attributes)
              .filter(attr => attr.name.startsWith('data-'))
              .map(attr => `${attr.name}="${attr.value}"`)
              .join(' '),
            position: { x: Math.round(rect.x), y: Math.round(rect.y) },
            size: { w: Math.round(rect.width), h: Math.round(rect.height) },
            visible: rect.width > 0 && rect.height > 0 && 
                    getComputedStyle(el).display !== 'none' &&
                    getComputedStyle(el).visibility !== 'hidden',
            clickable: el.onclick !== null || el.getAttribute('onclick') || 
                      getComputedStyle(el).cursor === 'pointer' ||
                      el.tagName.toLowerCase() === 'button' ||
                      el.tagName.toLowerCase() === 'a'
          };
        };

        // Find all potentially interactive elements
        const interactiveElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 20 && rect.height > 15 && 
                   rect.y < window.innerHeight &&
                   style.display !== 'none' &&
                   (el.onclick || el.getAttribute('onclick') || style.cursor === 'pointer' ||
                    el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'a' ||
                    el.getAttribute('role') === 'tab' || el.className.toLowerCase().includes('tab'));
          })
          .slice(0, 50) // Limit to prevent overwhelming the AI
          .map(getElementInfo);

        // Analyze navigation context
        const currentUrl = window.location.href;
        const urlMatches = currentUrl === requestedUrl || currentUrl.startsWith(requestedUrl);
        
        // Detect login/authentication pages
        const isLoginPage = 
          currentUrl.includes('/login') || 
          currentUrl.includes('/signin') || 
          currentUrl.includes('/auth') ||
          document.title.toLowerCase().includes('login') ||
          document.title.toLowerCase().includes('sign in') ||
          document.querySelector('input[type="password"]') !== null ||
          document.querySelector('[placeholder*="password"]') !== null ||
          document.querySelector('button[type="submit"]') !== null && 
          (document.querySelector('input[type="email"]') || document.querySelector('input[type="username"]'));
        
        // Detect error pages
        const isErrorPage = 
          currentUrl.includes('/error') ||
          currentUrl.includes('/404') ||
          currentUrl.includes('/403') ||
          document.title.toLowerCase().includes('error') ||
          document.title.toLowerCase().includes('not found') ||
          document.body.textContent.toLowerCase().includes('page not found');
        
        // Check for authentication indicators
        const hasAuthIndicators = 
          document.querySelector('[href*="logout"]') ||
          document.querySelector('[href*="profile"]') ||
          document.querySelector('.user-menu') ||
          document.querySelector('.user-avatar') ||
          document.querySelector('[class*="user"]') ||
          document.querySelector('[data-testid*="user"]');

        return {
          title: document.title,
          url: currentUrl,
          requestedUrl: requestedUrl,
          urlMatches: urlMatches,
          isLoginPage: isLoginPage,
          isErrorPage: isErrorPage,
          isAuthenticated: hasAuthIndicators,
          redirected: !urlMatches,
          interactiveElements
        };
      }, url);

      const prompt = `You are an expert web navigation and UI analyzer. Analyze this webpage's navigation context and UI elements.

Navigation Context:
- Requested URL: ${pageInfo.requestedUrl}
- Current URL: ${pageInfo.url}
- Page Title: ${pageInfo.title}
- URL Matches Request: ${pageInfo.urlMatches}
- Is Login Page: ${pageInfo.isLoginPage}
- Is Error Page: ${pageInfo.isErrorPage}
- User Authenticated: ${pageInfo.isAuthenticated}
- Was Redirected: ${pageInfo.redirected}

Interactive Elements Found:
${pageInfo.interactiveElements.map((el, i) => 
  `${i + 1}. ${el.tag}${el.className ? `.${el.className.split(' ')[0]}` : ''}${el.id ? `#${el.id}` : ''} 
     Text: "${el.text}"
     Position: (${el.position.x}, ${el.position.y}) Size: ${el.size.w}x${el.size.h}
     Role: ${el.role} | Aria-label: ${el.ariaLabel} | Data: ${el.dataAttrs}
     Clickable: ${el.clickable}`
).join('\n')}

CRITICAL: Analyze the navigation context first. Respond with a JSON object:

{
  "navigationIssue": boolean (true if on wrong page, login page, or error),
  "issueType": "login_required|error_page|wrong_page|access_denied|none",
  "shouldProceedWithScreenshots": boolean,
  "navigationAction": "login|retry|skip|proceed",
  "issueDescription": "explanation of the navigation problem",
  "hasTabs": boolean (only analyze if shouldProceedWithScreenshots is true),
  "tabElements": [
    {
      "elementIndex": number (from list above),
      "confidence": number (0-100),
      "tabName": "string",
      "reason": "why this is identified as a tab",
      "clickOrder": number (order to click them in)
    }
  ],
  "navigationStrategy": "description of how to navigate",
  "recommendations": ["suggestions based on page analysis"]
}

Priority Analysis:
1. FIRST: Check if we're on the correct page or if authentication is needed
2. If login page: Identify login elements, recommend authentication
3. If error page: Identify the error and recommend action
4. ONLY if on correct page: Analyze for tabs and UI elements
5. Be very conservative about tab identification - avoid clicking random elements

If authentication is required, focus on login flow rather than tab detection.`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const aiResponse = response.data.choices[0].message.content;
      console.log(`🧠 AI Response: ${aiResponse.substring(0, 200)}...`);
      
      // Parse JSON response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI response does not contain valid JSON');
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      // Check for navigation issues first
      if (analysis.navigationIssue) {
        return {
          navigationIssue: true,
          issueType: analysis.issueType,
          issueDescription: analysis.issueDescription,
          navigationAction: analysis.navigationAction,
          shouldProceedWithScreenshots: analysis.shouldProceedWithScreenshots,
          hasTabs: false,
          tabs: [],
          strategy: analysis.navigationStrategy,
          recommendations: analysis.recommendations,
          pageInfo: {
            requestedUrl: pageInfo.requestedUrl,
            currentUrl: pageInfo.url,
            isLoginPage: pageInfo.isLoginPage,
            isErrorPage: pageInfo.isErrorPage,
            isAuthenticated: pageInfo.isAuthenticated,
            redirected: pageInfo.redirected
          },
          totalAnalyzed: pageInfo.interactiveElements.length
        };
      }
      
      // Only process tabs if we should proceed with screenshots
      const tabs = analysis.shouldProceedWithScreenshots && analysis.tabElements ? 
        analysis.tabElements.map(tab => {
          const element = pageInfo.interactiveElements[tab.elementIndex - 1];
          if (!element) return null;
          
          // Create selector for this element
          let selector = element.tag;
          if (element.id) {
            selector = `#${element.id}`;
          } else if (element.className) {
            selector = `.${element.className.split(' ').join('.')}`;
          } else {
            // Use position-based selector as fallback
            selector = `${element.tag}:nth-child(${tab.elementIndex})`;
          }
          
          return {
            text: tab.tabName || element.text,
            selector,
            confidence: tab.confidence,
            reason: tab.reason,
            clickOrder: tab.clickOrder,
            position: element.position,
            size: element.size,
            source: 'ai-detected'
          };
        }).filter(Boolean) || [] : [];

      return {
        navigationIssue: false,
        shouldProceedWithScreenshots: analysis.shouldProceedWithScreenshots,
        hasTabs: analysis.hasTabs && analysis.shouldProceedWithScreenshots,
        tabs: tabs.sort((a, b) => a.clickOrder - b.clickOrder),
        strategy: analysis.navigationStrategy,
        recommendations: analysis.recommendations,
        pageInfo: {
          requestedUrl: pageInfo.requestedUrl,
          currentUrl: pageInfo.url,
          isLoginPage: pageInfo.isLoginPage,
          isErrorPage: pageInfo.isErrorPage,
          isAuthenticated: pageInfo.isAuthenticated,
          redirected: pageInfo.redirected
        },
        totalAnalyzed: pageInfo.interactiveElements.length
      };

    } catch (error) {
      console.error(`❌ AI Analysis failed:`, error.message);
      
      // Check if page is still valid
      if (error.message.includes('Target page, context or browser has been closed')) {
        return {
          navigationIssue: true,
          issueType: 'page_closed',
          issueDescription: 'Page was closed during analysis',
          shouldProceedWithScreenshots: false,
          hasTabs: false,
          tabs: [],
          strategy: 'page closed',
          recommendations: ['Page was closed, cannot proceed with analysis']
        };
      }
      
      return {
        navigationIssue: false,
        shouldProceedWithScreenshots: true,
        hasTabs: false,
        tabs: [],
        strategy: 'fallback to manual detection',
        recommendations: ['AI analysis failed, using manual detection'],
        error: error.message
      };
    }
  }

  async analyzeScreenshotStrategy(page, url, tabAnalysis) {
    try {
      console.log(`🧠 AI determining screenshot strategy for: ${url}`);
      
      const prompt = `Based on the tab analysis, recommend a screenshot strategy:

Tab Analysis Results:
- Has Tabs: ${tabAnalysis.hasTabs}
- Number of Tabs: ${tabAnalysis.tabs.length}
- Tabs Found: ${tabAnalysis.tabs.map(t => `"${t.text}" (confidence: ${t.confidence}%)`).join(', ')}
- Navigation Strategy: ${tabAnalysis.strategy}

Please provide a JSON response:
{
  "screenshotApproach": "string (full-page, viewport-only, tab-focused, hybrid)",
  "shouldCaptureScrolling": boolean,
  "shouldCaptureFullPage": boolean,
  "tabScreenshotOrder": [array of tab indices in optimal order],
  "additionalCaptures": ["any additional screenshot recommendations"],
  "reasoning": "explanation of the strategy"
}`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const aiResponse = response.data.choices[0].message.content;
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {
        screenshotApproach: 'hybrid',
        shouldCaptureScrolling: true,
        shouldCaptureFullPage: true,
        tabScreenshotOrder: tabAnalysis.tabs.map((_, i) => i),
        additionalCaptures: [],
        reasoning: 'Default strategy due to AI parsing failure'
      };

    } catch (error) {
      console.error(`❌ AI Strategy Analysis failed:`, error.message);
      return {
        screenshotApproach: 'hybrid',
        shouldCaptureScrolling: true,
        shouldCaptureFullPage: true,
        tabScreenshotOrder: tabAnalysis.tabs.map((_, i) => i),
        additionalCaptures: [],
        reasoning: 'Fallback strategy due to AI failure'
      };
    }
  }
}

class DevScreenshotTool {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './screenshots',
      viewport: options.viewport || { width: 1920, height: 1080 },
      delay: options.delay || 2000,
      scrollDelay: options.scrollDelay || 1500,
      scrollStep: options.scrollStep || 800,
      maxScrollScreenshots: options.maxScrollScreenshots || 10,
      maxPages: options.maxPages || 100,
      maxDepth: options.maxDepth || 3,
      userDataDir: options.userDataDir || null, // For persistent sessions
      headless: options.headless !== false,
      timeout: options.timeout || 30000,
      
      // Authentication options
      loginUrl: options.loginUrl || null,
      loginCredentials: options.loginCredentials || null,
      sessionFile: options.sessionFile || './session.json',
      
      // Tab handling options
      handleTabs: options.handleTabs !== false, // Default to true
      tabSelectors: options.tabSelectors || [
        '[role="tab"]',
        '.tab:not(.tab-content)',
        '.nav-tab',
        '.nav-link',
        '.tabs > *',
        '.tab-header > *',
        '.MuiTab-root', // Material-UI
        '.ant-tabs-tab', // Ant Design
        '[data-tab]',
        '[aria-selected]'
      ],
      tabContainerSelectors: options.tabContainerSelectors || [
        '[role="tablist"]',
        '.tabs',
        '.nav-tabs',
        '.tab-container',
        '.MuiTabs-root',
        '.ant-tabs'
      ],
      tabDelay: options.tabDelay || 1500, // Wait time after clicking a tab
      maxTabsPerPage: options.maxTabsPerPage || 10,
      
      // AI-powered analysis options
      useAI: options.useAI !== false && options.openrouterApiKey, // Enable if API key provided
      openrouterApiKey: options.openrouterApiKey || null,
      aiModel: options.aiModel || 'deepseek/deepseek-chat-v3-0324:free',
      
      // What to exclude (much more permissive now)
      excludePatterns: options.excludePatterns || [
        '/api/', '/.well-known/', '/health', '/metrics',
        '.pdf', '.zip', '.csv', '.xlsx', '.doc',
        'mailto:', 'tel:', 'javascript:', '#'
      ],
      
      // File type patterns to include
      includeFileTypes: options.includeFileTypes || [
        '', '.html', '.php', '.aspx', '.jsp'
      ],
      
      ...options
    };
    
    this.browser = null;
    this.context = null;
    this.visitedUrls = new Set();
    this.screenshotCount = 0;
    this.results = [];
    
    // Initialize AI analyzer if API key is provided
    this.aiAnalyzer = this.options.openrouterApiKey ? 
      new AIPageAnalyzer(this.options.openrouterApiKey, this.options.aiModel) : null;
  }

  async init() {
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    const browserOptions = {
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    // Use persistent context if userDataDir is provided
    if (this.options.userDataDir) {
      this.context = await chromium.launchPersistentContext(this.options.userDataDir, {
        ...browserOptions,
        viewport: this.options.viewport
      });
      this.browser = this.context.browser();
    } else {
      this.browser = await chromium.launch(browserOptions);
      this.context = await this.browser.newContext({
        viewport: this.options.viewport
      });
    }
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async saveSession() {
    if (!this.options.sessionFile) return;
    
    try {
      const cookies = await this.context.cookies();
      const sessionData = {
        cookies,
        timestamp: Date.now(),
        userAgent: await this.context.newPage().then(p => p.evaluate(() => navigator.userAgent))
      };
      
      await fs.writeFile(this.options.sessionFile, JSON.stringify(sessionData, null, 2));
      console.log(`💾 Session saved to ${this.options.sessionFile}`);
    } catch (error) {
      console.warn('⚠️ Failed to save session:', error.message);
    }
  }

  async loadSession() {
    if (!this.options.sessionFile) return false;
    
    try {
      const sessionData = JSON.parse(await fs.readFile(this.options.sessionFile, 'utf8'));
      
      // Check if session is not too old (24 hours)
      if (Date.now() - sessionData.timestamp > 24 * 60 * 60 * 1000) {
        console.log('🕒 Session expired, will need fresh login');
        return false;
      }
      
      await this.context.addCookies(sessionData.cookies);
      console.log(`✅ Session loaded from ${this.options.sessionFile}`);
      return true;
    } catch (error) {
      console.log('🔄 No valid session found, starting fresh');
      return false;
    }
  }

  async login() {
    console.log('⚠️ Login method called but should not be used directly');
    console.log('⚠️ Use loginOnPage(page) instead for proper page management');
    return false;
  }

  async loginOnPage(page) {
    if (!this.options.loginUrl || !this.options.loginCredentials) {
      console.log('⚠️ No login configuration provided');
      return false;
    }
    
    try {
      console.log(`🔐 Checking current page authentication status...`);
      
      // Check current page state 
      const currentUrl = page.url();
      const currentTitle = await page.title();
      
      console.log(`   Current URL: ${currentUrl}`);
      console.log(`   Current Title: ${currentTitle}`);
      
      // Check if already authenticated by looking for auth indicators on current page
      const authStatus = await page.evaluate(() => {
        // Look for authentication indicators
        const hasLogoutButton = document.querySelector('[href*="logout"], [onclick*="logout"], [class*="logout"], [data-testid*="logout"]');
        const hasUserMenu = document.querySelector('.user-menu, [class*="user-menu"], [class*="profile"], [data-testid*="user"]');
        const hasUserAvatar = document.querySelector('.user-avatar, [class*="avatar"], img[class*="user"]');
        const hasWelcomeMessage = document.body.textContent.toLowerCase().includes('welcome') || 
                                 document.body.textContent.toLowerCase().includes('dashboard');
        
        // Check if we're on a login page
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
      console.log(`   Auth Indicators:`, authStatus.indicators);
      
      // If already authenticated, no need to login
      if (authStatus.isAuthenticated && !authStatus.isOnLoginPage) {
        console.log('✅ Already authenticated on current page');
        await this.saveSession();
        return true;
      }
      
      // If not on login page but also not authenticated, navigate to login
      if (!authStatus.isOnLoginPage) {
        console.log(`🔐 Navigating to login page: ${this.options.loginUrl}`);
        await page.goto(this.options.loginUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
      }
      
      // Now attempt login
      console.log(`🔐 Attempting login on current page...`);
      
      const { usernameSelector, passwordSelector, submitSelector, username, password } = this.options.loginCredentials;
      
      // Check if login form exists
      const loginFormExists = await page.locator(usernameSelector).count() > 0;
      if (!loginFormExists) {
        console.log('⚠️ Login form not found with selector:', usernameSelector);
        
        // Try to find alternative login fields
        const altLoginForm = await page.evaluate(() => {
          const emailField = document.querySelector('input[type="email"], input[name*="email"], input[name*="username"], input[placeholder*="email"]');
          const passwordField = document.querySelector('input[type="password"]');
          const submitButton = document.querySelector('button[type="submit"], input[type="submit"], button:contains("Login"), button:contains("Sign in")');
          
          return {
            hasEmail: !!emailField,
            hasPassword: !!passwordField,
            hasSubmit: !!submitButton,
            emailSelector: emailField ? `input[type="${emailField.type}"]` : null,
            passwordSelector: passwordField ? 'input[type="password"]' : null
          };
        });
        
        if (!altLoginForm.hasEmail || !altLoginForm.hasPassword) {
          console.log('❌ Cannot find login form fields');
          return false;
        }
        
        console.log('🔄 Using alternative login selectors');
      }
      
      // Fill login form
      console.log(`📝 Filling login form...`);
      await page.fill(usernameSelector, username);
      await page.fill(passwordSelector, password);
      
      console.log(`🖱️ Clicking submit button...`);
      await page.click(submitSelector);
      
      // Wait for response - either redirect or error
      console.log(`⏳ Waiting for login response...`);
      
      try {
        // Wait for either navigation or error message
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
        
        // Look for error messages
        const errorElements = document.querySelectorAll('.error, [class*="error"], [class*="invalid"], [class*="wrong"]');
        const hasError = errorElements.length > 0 && Array.from(errorElements).some(el => 
          el.textContent.toLowerCase().includes('invalid') || 
          el.textContent.toLowerCase().includes('incorrect') ||
          el.textContent.toLowerCase().includes('wrong')
        );
        
        // Look for success indicators
        const hasAuthIndicators = 
          document.querySelector('[href*="logout"], [onclick*="logout"]') ||
          document.querySelector('.user-menu, [class*="user-menu"]') ||
          document.querySelector('.user-avatar, [class*="avatar"]');
        
        return {
          url: currentUrl,
          isStillOnLogin,
          hasError,
          hasAuthIndicators,
          pageTitle: document.title
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
        console.log('✅ Login successful - redirected away from login page or auth indicators found');
        await this.saveSession();
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

  shouldVisitUrl(url, baseUrl) {
    try {
      const urlObj = new URL(url, baseUrl);
      const fullUrl = urlObj.href;
      
      // Skip if already visited
      if (this.visitedUrls.has(fullUrl)) return false;
      
      // Only crawl same domain
      const baseDomain = new URL(baseUrl).hostname;
      if (urlObj.hostname !== baseDomain) return false;
      
      // Check exclude patterns
      const pathAndSearch = urlObj.pathname + urlObj.search;
      for (const pattern of this.options.excludePatterns) {
        if (pathAndSearch.includes(pattern)) return false;
      }
      
      // Check file extensions
      const extension = path.extname(urlObj.pathname).toLowerCase();
      if (!this.options.includeFileTypes.includes(extension)) return false;
      
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

  async aiDetectAndHandleTabs(page, url, baseName, timestamp) {
    if (!this.aiAnalyzer) {
      console.log(`⚠️ AI analysis not available, falling back to manual detection`);
      return await this.detectAndHandleTabs(page, url, baseName, timestamp);
    }

    const results = [];
    
    try {
      console.log(`🧠 Starting AI-powered tab analysis for: ${url}`);
      
      // Get AI analysis of the page
      const aiAnalysis = await this.aiAnalyzer.analyzePageForTabs(page, url);
      
      console.log(`🧠 AI Navigation Analysis:`);
      if (aiAnalysis.pageInfo) {
        console.log(`   Requested: ${aiAnalysis.pageInfo.requestedUrl}`);
        console.log(`   Current: ${aiAnalysis.pageInfo.currentUrl}`);
        console.log(`   Redirected: ${aiAnalysis.pageInfo.redirected}`);
        console.log(`   Login Page: ${aiAnalysis.pageInfo.isLoginPage}`);
        console.log(`   Error Page: ${aiAnalysis.pageInfo.isErrorPage}`);
        console.log(`   Authenticated: ${aiAnalysis.pageInfo.isAuthenticated}`);
      }
      
      // Handle navigation issues first
      if (aiAnalysis.navigationIssue) {
        console.log(`⚠️ Navigation Issue Detected:`);
        console.log(`   Issue Type: ${aiAnalysis.issueType}`);
        console.log(`   Description: ${aiAnalysis.issueDescription}`);
        console.log(`   Recommended Action: ${aiAnalysis.navigationAction}`);
        
        if (aiAnalysis.recommendations?.length > 0) {
          console.log(`   AI Recommendations:`);
          aiAnalysis.recommendations.forEach((rec, i) => {
            console.log(`     ${i + 1}. ${rec}`);
          });
        }
        
        // Handle different navigation issues
        if (aiAnalysis.issueType === 'login_required' && this.options.loginCredentials) {
          console.log(`🔐 Attempting automatic login on current page...`);
          try {
            const loginSuccess = await this.loginOnPage(page);
            if (loginSuccess) {
              console.log(`✅ Login successful, retrying page access...`);
              await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });
              await page.waitForTimeout(this.options.delay);
              await this.waitForContent(page);
              
              // Retry analysis after login
              return await this.aiDetectAndHandleTabs(page, url, baseName, timestamp);
            } else {
              console.log(`❌ Login failed`);
            }
          } catch (loginError) {
            console.log(`❌ Login attempt failed: ${loginError.message}`);
          }
        }
        
        // Return navigation issue result
        results.push({
          type: 'navigation-issue',
          url,
          issueType: aiAnalysis.issueType,
          issueDescription: aiAnalysis.issueDescription,
          navigationAction: aiAnalysis.navigationAction,
          pageInfo: aiAnalysis.pageInfo,
          timestamp
        });
        
        if (!aiAnalysis.shouldProceedWithScreenshots) {
          console.log(`🚫 AI recommends not proceeding with screenshots on this page`);
          return results;
        }
      }
      
      console.log(`🧠 AI Tab Analysis:`);
      console.log(`   Should Proceed: ${aiAnalysis.shouldProceedWithScreenshots}`);
      console.log(`   Has Tabs: ${aiAnalysis.hasTabs}`);
      console.log(`   Tabs Found: ${aiAnalysis.tabs.length}`);
      console.log(`   Total Elements Analyzed: ${aiAnalysis.totalAnalyzed}`);
      console.log(`   Strategy: ${aiAnalysis.strategy}`);
      
      if (aiAnalysis.recommendations?.length > 0) {
        console.log(`   AI Recommendations:`);
        aiAnalysis.recommendations.forEach((rec, i) => {
          console.log(`     ${i + 1}. ${rec}`);
        });
      }
      
      if (!aiAnalysis.shouldProceedWithScreenshots || !aiAnalysis.hasTabs || aiAnalysis.tabs.length === 0) {
        console.log(`ℹ️ AI detected no actionable tabs on this page`);
        return results;
      }

      // Get AI's screenshot strategy
      const screenshotStrategy = await this.aiAnalyzer.analyzeScreenshotStrategy(page, url, aiAnalysis);
      console.log(`🧠 AI Screenshot Strategy: ${screenshotStrategy.screenshotApproach}`);
      console.log(`   Reasoning: ${screenshotStrategy.reasoning}`);

      // Process each tab identified by AI
      console.log(`🏷️ Processing ${aiAnalysis.tabs.length} AI-identified tabs:`);
      aiAnalysis.tabs.forEach((tab, i) => {
        console.log(`   ${i + 1}. "${tab.text}" (confidence: ${tab.confidence}%, reason: ${tab.reason})`);
      });
      
      // Take screenshots of each tab
      for (let i = 0; i < aiAnalysis.tabs.length; i++) {
        const tab = aiAnalysis.tabs[i];
        
        try {
          console.log(`🎯 AI-guided tab click ${i + 1}/${aiAnalysis.tabs.length}: "${tab.text}" (${tab.confidence}% confidence)`);
          
          // Try to click the tab using the AI-provided selector
          let clickSuccess = false;
          
          try {
            await page.click(tab.selector, { timeout: 5000 });
            clickSuccess = true;
            console.log(`   ✅ Successfully clicked tab using selector: ${tab.selector}`);
          } catch (error) {
            console.log(`   ⚠️ Selector click failed, trying coordinate click: ${error.message}`);
            
            // Fallback to coordinate clicking
            if (tab.position) {
              try {
                const x = tab.position.x + (tab.size?.w || 50) / 2;
                const y = tab.position.y + (tab.size?.h || 25) / 2;
                await page.mouse.click(x, y);
                clickSuccess = true;
                console.log(`   ✅ Successfully clicked tab using coordinates: (${x}, ${y})`);
              } catch (coordError) {
                console.log(`   ❌ Coordinate click also failed: ${coordError.message}`);
              }
            }
          }
          
          if (!clickSuccess) {
            console.log(`   ❌ All click attempts failed for tab "${tab.text}"`);
            results.push({ 
              type: 'ai-tab', 
              url, 
              tab_name: tab.text, 
              tab_index: i + 1,
              confidence: tab.confidence,
              error: 'Click failed',
              ai_reason: tab.reason
            });
            continue;
          }
          
          // Wait for content to load after tab click
          await page.waitForTimeout(this.options.tabDelay);
          await this.waitForContent(page);
          
          // Take comprehensive screenshots of this tab state (similar to regular page capture)
          const tabName = tab.text
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .substring(0, 30) || `ai_tab_${i + 1}`;
          
          console.log(`   📸 Taking comprehensive screenshots for tab: "${tab.text}"`);
          
          // Reset scroll position for this tab
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(1000);
          await this.waitForContent(page);

          // Get page info for this tab state
          const pageInfo = await page.evaluate(() => {
            const body = document.body;
            const documentElement = document.documentElement;
            
            // Find scrollable containers
            const scrollableContainers = Array.from(document.querySelectorAll('*')).filter(el => {
              const style = getComputedStyle(el);
              return (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                     el.scrollHeight > el.clientHeight &&
                     el.clientHeight > 200;
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

          let currentScroll = 0;
          let screenshotIndex = 0;
          const maxScroll = Math.max(
            pageInfo.windowScrollHeight - pageInfo.windowClientHeight,
            pageInfo.windowScrollHeight - pageInfo.viewportHeight
          );

          // Take initial screenshot (top of tab content)
          const topFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_ai_tab_${tabName}_top_${timestamp}.png`;
          const topFilepath = path.join(this.options.outputDir, topFilename);
          await page.screenshot({ path: topFilepath, type: 'png', fullPage: false });
          this.screenshotCount++;
          results.push({ 
            type: 'ai-tab', 
            url, 
            tab_name: tab.text, 
            tab_index: i + 1,
            confidence: tab.confidence,
            filename: topFilename,
            ai_reason: tab.reason,
            click_method: 'ai-guided',
            screenshot_type: 'top'
          });
          console.log(`   ✅ Tab top screenshot saved: ${topFilename}`);
          screenshotIndex++;

          // Take scroll screenshots for this tab if needed
          if (maxScroll > 100 || pageInfo.hasScrollableContainers) {
            console.log(`   🔄 Taking scroll screenshots for tab "${tab.text}" (max scroll: ${maxScroll}px)`);
            
            let totalScrollSteps = Math.max(
              Math.ceil(maxScroll / this.options.scrollStep),
              pageInfo.hasScrollableContainers ? Math.ceil((pageInfo.scrollableContainers[0]?.scrollHeight - pageInfo.scrollableContainers[0]?.clientHeight || 0) / this.options.scrollStep) : 0
            );
            
            totalScrollSteps = Math.min(totalScrollSteps, this.options.maxScrollScreenshots - 1);
            
            for (let step = 1; step <= totalScrollSteps; step++) {
              if (screenshotIndex >= this.options.maxScrollScreenshots) break;
              
              // Calculate scroll position
              if (maxScroll > 100) {
                currentScroll = Math.min((step * this.options.scrollStep), maxScroll);
                await page.evaluate((scrollY) => {
                  window.scrollTo({ top: scrollY, behavior: 'smooth' });
                }, currentScroll);
              } else if (pageInfo.hasScrollableContainers) {
                const container = pageInfo.scrollableContainers[0];
                const containerMaxScroll = container.scrollHeight - container.clientHeight;
                currentScroll = Math.min((step * this.options.scrollStep), containerMaxScroll);
                
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

              // Wait for scroll to complete
              await page.waitForTimeout(this.options.scrollDelay);
              await this.waitForContent(page);

              const scrollFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_ai_tab_${tabName}_scroll_${currentScroll}px_${timestamp}.png`;
              const scrollFilepath = path.join(this.options.outputDir, scrollFilename);
              await page.screenshot({ path: scrollFilepath, type: 'png', fullPage: false });
              this.screenshotCount++;
              results.push({ 
                type: 'ai-tab', 
                url, 
                tab_name: tab.text, 
                tab_index: i + 1,
                confidence: tab.confidence,
                filename: scrollFilename,
                ai_reason: tab.reason,
                click_method: 'ai-guided',
                screenshot_type: 'scroll',
                scroll_position: currentScroll
              });
              console.log(`   ✅ Tab scroll screenshot saved: ${scrollFilename} (${currentScroll}px)`);
              screenshotIndex++;
            }
          }

          // Take full page screenshot for this tab
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(1000);
          
          const fullPageFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_ai_tab_${tabName}_fullpage_${timestamp}.png`;
          const fullPageFilepath = path.join(this.options.outputDir, fullPageFilename);
          await page.screenshot({ path: fullPageFilepath, type: 'png', fullPage: true });
          this.screenshotCount++;
          results.push({ 
            type: 'ai-tab', 
            url, 
            tab_name: tab.text, 
            tab_index: i + 1,
            confidence: tab.confidence,
            filename: fullPageFilename,
            ai_reason: tab.reason,
            click_method: 'ai-guided',
            screenshot_type: 'fullpage'
          });
          
          console.log(`   ✅ AI-guided tab fullpage screenshot saved: ${fullPageFilename}`);
          
          // Additional captures if AI recommends them
          if (screenshotStrategy.additionalCaptures?.length > 0 && i === 0) {
            console.log(`   📸 AI recommends additional captures: ${screenshotStrategy.additionalCaptures.join(', ')}`);
          }
          
          // Small delay between tabs
          await page.waitForTimeout(500);
          
        } catch (error) {
          console.warn(`❌ AI-guided tab screenshot failed for "${tab.text}":`, error.message);
          results.push({ 
            type: 'ai-tab', 
            url, 
            tab_name: tab.text, 
            tab_index: i + 1,
            confidence: tab.confidence,
            error: error.message,
            ai_reason: tab.reason
          });
        }
      }
      
      // Try to return to the first tab as suggested by AI
      if (aiAnalysis.tabs.length > 0) {
        try {
          const firstTab = aiAnalysis.tabs[0];
          await page.click(firstTab.selector);
          await page.waitForTimeout(500);
          console.log(`🔄 AI-guided return to first tab: "${firstTab.text}"`);
        } catch (error) {
          console.warn(`⚠️ Could not return to first tab:`, error.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ AI-powered tab detection failed:`, error.message);
      console.log(`🔄 Falling back to manual tab detection`);
      
      // Fallback to manual detection
      const fallbackResults = await this.detectAndHandleTabs(page, url, baseName, timestamp);
      results.push(...fallbackResults);
      
      results.push({ 
        type: 'ai-tab', 
        url, 
        error: `AI analysis failed: ${error.message}`,
        fallback_used: true
      });
    }
    
    return results;
  }

  async detectAndHandleTabs(page, url, baseName, timestamp) {
    if (!this.options.handleTabs) {
      return [];
    }

    const results = [];
    
    try {
      console.log(`🔍 Detecting tabs on: ${url}`);
      
      // Enhanced tab detection with multiple strategies and debugging
      const tabInfo = await page.evaluate((selectors) => {
        const { tabSelectors, tabContainerSelectors } = selectors;
        
        // Strategy 1: Find tab containers first
        const containers = [];
        const containerDetails = [];
        for (const containerSelector of tabContainerSelectors) {
          const containerElements = Array.from(document.querySelectorAll(containerSelector));
          containers.push(...containerElements);
          if (containerElements.length > 0) {
            containerDetails.push({
              selector: containerSelector,
              count: containerElements.length,
              elements: containerElements.map(el => ({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                children: el.children.length
              }))
            });
          }
        }
        
        // Strategy 2: Look for individual tabs with enhanced selectors
        const allTabs = [];
        const selectorResults = [];
        
        // Add more comprehensive selectors
        const enhancedTabSelectors = [
          ...tabSelectors,
          // Button-based tabs
          'button[class*="tab"]',
          'button[data-testid*="tab"]',
          'button[aria-controls]',
          // Link-based tabs
          'a[class*="tab"]',
          'a[role="tab"]',
          // Div-based tabs
          'div[class*="tab"]:not([class*="content"]):not([class*="panel"]):not([class*="pane"])',
          'div[role="tab"]',
          'div[data-tab]',
          // List item tabs
          'li[class*="tab"]',
          'li[role="tab"]',
          // Span-based tabs
          'span[class*="tab"]:not([class*="content"])',
          // React/Vue component patterns
          '[class*="Tab"]:not([class*="Content"]):not([class*="Panel"])',
          '[class*="TabButton"]',
          '[class*="TabItem"]',
          '[class*="TabHeader"]',
          // Modern CSS patterns
          '[class*="segment"]',
          '[class*="pill"]',
          '[class*="chip"]:not([class*="input"])'
        ];
        
        for (const tabSelector of enhancedTabSelectors) {
          try {
            const tabElements = Array.from(document.querySelectorAll(tabSelector));
            selectorResults.push({
              selector: tabSelector,
              found: tabElements.length
            });
            
            for (const tab of tabElements) {
              // Check visibility with more lenient criteria
              const style = getComputedStyle(tab);
              const rect = tab.getBoundingClientRect();
              
              const isVisible = style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               parseFloat(style.opacity) > 0.1 &&
                               rect.width > 10 && 
                               rect.height > 10;
              
              if (isVisible) {
                // Get tab text from multiple sources
                const text = (
                  tab.textContent?.trim() || 
                  tab.getAttribute('aria-label') || 
                  tab.getAttribute('title') || 
                  tab.getAttribute('data-tab') ||
                  tab.getAttribute('data-testid') ||
                  ''
                ).substring(0, 50);
                
                // Enhanced active state detection
                const isActive = tab.getAttribute('aria-selected') === 'true' || 
                                tab.getAttribute('aria-current') === 'page' ||
                                tab.classList.contains('active') || 
                                tab.classList.contains('selected') ||
                                tab.classList.contains('current') ||
                                tab.classList.contains('is-active') ||
                                tab.classList.contains('is-selected') ||
                                tab.hasAttribute('data-active') ||
                                style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                                style.borderBottomColor !== 'rgba(0, 0, 0, 0)';
                
                // Create multiple selector options for reliability
                const uniqueId = tab.id ? `#${tab.id}` : null;
                const classSelector = tab.className ? `.${tab.className.split(' ').join('.')}` : null;
                const indexSelector = `${tab.tagName.toLowerCase()}:nth-child(${Array.from(tab.parentNode.children).indexOf(tab) + 1})`;
                const textSelector = text ? `${tab.tagName.toLowerCase()}:contains("${text}")` : null;
                
                // Use the most reliable selector
                let bestSelector = uniqueId || classSelector || indexSelector;
                
                // If we're inside a container, make the selector more specific
                if (containers.length > 0) {
                  const container = containers.find(c => c.contains(tab));
                  if (container) {
                    const containerClass = container.className ? `.${container.className.split(' ')[0]}` : container.tagName.toLowerCase();
                    bestSelector = `${containerClass} ${bestSelector}`;
                  }
                }
                
                allTabs.push({
                  text,
                  selector: bestSelector,
                  fallbackSelector: indexSelector,
                  isActive,
                  tagName: tab.tagName,
                  className: tab.className,
                  id: tab.id,
                  hasClickHandler: tab.onclick !== null || tab.getAttribute('onclick') !== null,
                  rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  }
                });
              }
            }
          } catch (e) {
            console.log(`Error with selector ${tabSelector}:`, e.message);
          }
        }
        
        // Strategy 3: Heuristic detection for custom implementations
        const heuristicTabs = [];
        const allClickableElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            (el.onclick || el.getAttribute('onclick') || style.cursor === 'pointer') &&
            rect.width > 20 && rect.height > 15 &&
            rect.y < window.innerHeight / 2 && // Likely in header area
            style.display !== 'none' &&
            el.textContent?.trim().length > 0 &&
            el.textContent?.trim().length < 50
          );
        });
        
        // Group nearby clickable elements that might be tabs
        const potentialTabGroups = [];
        allClickableElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const existingGroup = potentialTabGroups.find(group => 
            Math.abs(group.avgY - rect.y) < 50 && 
            Math.abs(group.avgX - rect.x) < 200
          );
          
          if (existingGroup) {
            existingGroup.elements.push(el);
            existingGroup.avgY = (existingGroup.avgY + rect.y) / 2;
            existingGroup.avgX = (existingGroup.avgX + rect.x) / 2;
          } else {
            potentialTabGroups.push({
              elements: [el],
              avgY: rect.y,
              avgX: rect.x
            });
          }
        });
        
        // Add groups with 2+ elements as potential tabs
        potentialTabGroups.filter(group => group.elements.length >= 2).forEach(group => {
          group.elements.forEach((el, index) => {
            const text = el.textContent?.trim() || `Tab ${index + 1}`;
            const rect = el.getBoundingClientRect();
            heuristicTabs.push({
              text: text.substring(0, 50),
              selector: `${el.tagName.toLowerCase()}:nth-child(${Array.from(el.parentNode.children).indexOf(el) + 1})`,
              fallbackSelector: `${el.tagName.toLowerCase()}:nth-child(${Array.from(el.parentNode.children).indexOf(el) + 1})`,
              isActive: false,
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              source: 'heuristic',
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            });
          });
        });
        
        // Combine and deduplicate results
        const combinedTabs = [...allTabs, ...heuristicTabs];
        const uniqueTabs = combinedTabs.filter((tab, index, self) => {
          return index === self.findIndex(t => 
            (t.text === tab.text && Math.abs(t.rect.x - tab.rect.x) < 10) ||
            (t.selector === tab.selector)
          );
        }).filter(tab => {
          // Less restrictive filtering
          const text = tab.text.toLowerCase();
          return text.length > 0 && 
                 !text.includes('dropdown') &&
                 !text.includes('menu') &&
                 !text.includes('button') &&
                 !text.includes('close') &&
                 !text.includes('×');
        });
        
        return {
          containers: containers.length,
          containerDetails,
          selectorResults,
          tabs: uniqueTabs,
          totalFound: uniqueTabs.length,
          heuristicFound: heuristicTabs.length,
          directFound: allTabs.length
        };
      }, { 
        tabSelectors: this.options.tabSelectors, 
        tabContainerSelectors: this.options.tabContainerSelectors 
      });

      // Enhanced debugging output
      console.log(`📊 Tab detection results:`);
      console.log(`   Total found: ${tabInfo.totalFound} tabs`);
      console.log(`   Direct matches: ${tabInfo.directFound}`);
      console.log(`   Heuristic matches: ${tabInfo.heuristicFound}`);
      console.log(`   Containers found: ${tabInfo.containers}`);
      
      if (tabInfo.containerDetails.length > 0) {
        console.log(`   Container details:`);
        tabInfo.containerDetails.forEach(detail => {
          console.log(`     ${detail.selector}: ${detail.count} containers`);
        });
      }
      
      if (tabInfo.selectorResults.length > 0) {
        console.log(`   Selector results:`);
        tabInfo.selectorResults.filter(r => r.found > 0).forEach(result => {
          console.log(`     ${result.selector}: ${result.found} elements`);
        });
      }
      
      if (tabInfo.totalFound === 0) {
        console.log(`ℹ️ No tabs detected on page`);
        console.log(`🔍 Debug: Try adding custom selectors to your config if you know there are tabs`);
        return results;
      }

      if (tabInfo.totalFound > this.options.maxTabsPerPage) {
        console.log(`⚠️ Too many tabs detected (${tabInfo.totalFound}), limiting to ${this.options.maxTabsPerPage}`);
        tabInfo.tabs = tabInfo.tabs.slice(0, this.options.maxTabsPerPage);
      }

      console.log(`🏷️ Processing ${tabInfo.tabs.length} tabs:`);
      tabInfo.tabs.forEach((tab, i) => {
        console.log(`   ${i + 1}. "${tab.text}" (${tab.tagName}, selector: ${tab.selector})`);
      });
      
      // Take screenshot of each tab with enhanced error handling
      for (let i = 0; i < tabInfo.tabs.length; i++) {
        const tab = tabInfo.tabs[i];
        
        try {
          console.log(`🎯 Clicking tab ${i + 1}/${tabInfo.tabs.length}: "${tab.text}"`);
          
          // Try multiple click strategies
          let clickSuccess = false;
          
          // Strategy 1: Use primary selector
          try {
            await page.click(tab.selector, { timeout: 5000 });
            clickSuccess = true;
            console.log(`   ✅ Clicked using primary selector: ${tab.selector}`);
          } catch (error) {
            console.log(`   ⚠️ Primary selector failed: ${error.message}`);
          }
          
          // Strategy 2: Use fallback selector if primary failed
          if (!clickSuccess && tab.fallbackSelector && tab.fallbackSelector !== tab.selector) {
            try {
              await page.click(tab.fallbackSelector, { timeout: 5000 });
              clickSuccess = true;
              console.log(`   ✅ Clicked using fallback selector: ${tab.fallbackSelector}`);
            } catch (error) {
              console.log(`   ⚠️ Fallback selector failed: ${error.message}`);
            }
          }
          
          // Strategy 3: Use coordinate clicking
          if (!clickSuccess && tab.rect) {
            try {
              const x = tab.rect.x + tab.rect.width / 2;
              const y = tab.rect.y + tab.rect.height / 2;
              await page.mouse.click(x, y);
              clickSuccess = true;
              console.log(`   ✅ Clicked using coordinates: (${x}, ${y})`);
            } catch (error) {
              console.log(`   ⚠️ Coordinate click failed: ${error.message}`);
            }
          }
          
          if (!clickSuccess) {
            throw new Error(`All click strategies failed for tab "${tab.text}"`);
          }
          
          // Wait for tab content to load
          await page.waitForTimeout(this.options.tabDelay);
          await this.waitForContent(page);
          
          // Generate filename for this tab
          const tabName = tab.text
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .substring(0, 30) || `tab_${i + 1}`;
            
          const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_tab_${tabName}_${timestamp}.png`;
          const filepath = path.join(this.options.outputDir, filename);
          
          // Take screenshot
          await page.screenshot({ path: filepath, type: 'png', fullPage: false });
          
          this.screenshotCount++;
          results.push({ 
            type: 'tab', 
            url, 
            tab_name: tab.text, 
            tab_index: i + 1,
            tab_selector: tab.selector,
            click_method: clickSuccess ? 'success' : 'failed',
            filename 
          });
          
          console.log(`   ✅ Tab screenshot saved: ${filename}`);
          
          // Small delay between tabs
          await page.waitForTimeout(500);
          
        } catch (error) {
          console.warn(`❌ Failed to screenshot tab "${tab.text}":`, error.message);
          results.push({ 
            type: 'tab', 
            url, 
            tab_name: tab.text, 
            tab_index: i + 1,
            error: error.message,
            tab_selector: tab.selector,
            tab_details: tab
          });
        }
      }
      
      // Try to return to the first/default tab
      if (tabInfo.tabs.length > 0) {
        try {
          const firstTab = tabInfo.tabs.find(t => t.isActive) || tabInfo.tabs[0];
          await page.click(firstTab.selector);
          await page.waitForTimeout(500);
          console.log(`🔄 Returned to default tab: "${firstTab.text}"`);
        } catch (error) {
          console.warn(`⚠️ Could not return to default tab:`, error.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ Tab detection failed:`, error.message);
      results.push({ type: 'tab', url, error: error.message });
    }
    
    return results;
  }



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

  async screenshotElement(url, selector, options = {}) {
    const page = await this.context.newPage();
    const results = [];
    
    try {
      console.log(`🎯 Taking element screenshot: ${selector} from ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });
      await page.waitForTimeout(this.options.delay);
      await this.waitForContent(page);
      
      // Wait for the element
      await page.waitForSelector(selector, { timeout: 10000 });
      
      const element = page.locator(selector);
      const urlObj = new URL(url);
      const baseName = this.generateBaseName(urlObj);
      const selectorName = selector.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
      const timestamp = Date.now();
      
      const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_element_${selectorName}_${timestamp}.png`;
      const filepath = path.join(this.options.outputDir, filename);
      
      await element.screenshot({ path: filepath, type: 'png' });
      
      this.screenshotCount++;
      results.push({ type: 'element', url, selector, filename });
      console.log(`✅ Element screenshot saved: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Failed to screenshot element ${selector}:`, error.message);
      results.push({ type: 'element', url, selector, error: error.message });
    } finally {
      await page.close();
    }
    
    return results;
  }

  async screenshotRegion(url, region, options = {}) {
    const page = await this.context.newPage();
    const results = [];
    
    try {
      console.log(`📐 Taking region screenshot: ${region.x},${region.y} ${region.width}x${region.height} from ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });
      await page.waitForTimeout(this.options.delay);
      await this.waitForContent(page);
      
      const urlObj = new URL(url);
      const baseName = this.generateBaseName(urlObj);
      const timestamp = Date.now();
      
      const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_region_${region.x}x${region.y}_${region.width}x${region.height}_${timestamp}.png`;
      const filepath = path.join(this.options.outputDir, filename);
      
      await page.screenshot({ 
        path: filepath, 
        type: 'png',
        clip: region
      });
      
      this.screenshotCount++;
      results.push({ type: 'region', url, region, filename });
      console.log(`✅ Region screenshot saved: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Failed to screenshot region:`, error.message);
      results.push({ type: 'region', url, region, error: error.message });
    } finally {
      await page.close();
    }
    
    return results;
  }

  async screenshotPage(url, options = {}) {
    const {
      scrollScreenshots = true,
      fullPage = true,
      specificElements = []
    } = options;
    
    const page = await this.context.newPage();
    const results = [];
    
    try {
      console.log(`📸 Taking screenshots of: ${url}`);
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });
      await page.waitForTimeout(this.options.delay);
      await this.waitForContent(page);
      
      // Basic navigation check (even without AI)
      const currentUrl = page.url();
      const wasRedirected = !currentUrl.startsWith(url) && !url.startsWith(currentUrl);
      
      if (wasRedirected) {
        const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('/auth');
        const isErrorPage = currentUrl.includes('/error') || currentUrl.includes('/404') || currentUrl.includes('/403');
        
        if (isLoginPage) {
          console.log(`⚠️ Redirected to login page: ${currentUrl}`);
          if (this.options.loginCredentials) {
            console.log(`🔐 Attempting automatic login on current page...`);
            try {
              const loginSuccess = await this.loginOnPage(page);
              if (loginSuccess) {
                console.log(`✅ Login successful, retrying page access...`);
                await page.goto(url, { waitUntil: 'networkidle', timeout: this.options.timeout });
                await page.waitForTimeout(this.options.delay);
                await this.waitForContent(page);
              }
            } catch (loginError) {
              console.log(`❌ Login attempt failed: ${loginError.message}`);
            }
          } else {
            console.log(`❌ No login credentials configured - cannot access protected page`);
            results.push({ 
              type: 'navigation-issue', 
              url, 
              error: 'Login required but no credentials configured',
              currentUrl,
              isLoginPage: true
            });
            return results;
          }
        } else if (isErrorPage) {
          console.log(`❌ Redirected to error page: ${currentUrl}`);
          results.push({ 
            type: 'navigation-issue', 
            url, 
            error: 'Redirected to error page',
            currentUrl,
            isErrorPage: true
          });
          return results;
        } else {
          console.log(`ℹ️ Redirected to: ${currentUrl} (proceeding with screenshots)`);
        }
      }
      
      const urlObj = new URL(page.url()); // Use current URL after potential redirects
      const baseName = this.generateBaseName(urlObj);
      const timestamp = Date.now();
      
      // Handle tabs first - use AI if available, otherwise fall back to manual detection
      let tabResults = [];
      if (this.options.handleTabs) {
        tabResults = this.options.useAI ? 
          await this.aiDetectAndHandleTabs(page, url, baseName, timestamp) :
          await this.detectAndHandleTabs(page, url, baseName, timestamp);
        results.push(...tabResults);
      } else {
        console.log(`ℹ️ Tab detection disabled, proceeding with scroll screenshots only`);
      }
      
      // Take specific element screenshots if requested
      for (const selector of specificElements) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          const element = page.locator(selector);
          const selectorName = selector.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
          
          const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_element_${selectorName}_${timestamp}.png`;
          const filepath = path.join(this.options.outputDir, filename);
          
          await element.screenshot({ path: filepath, type: 'png' });
          this.screenshotCount++;
          results.push({ type: 'element', url, selector, filename });
          console.log(`✅ Element screenshot saved: ${filename}`);
        } catch (error) {
          console.warn(`⚠️ Could not screenshot element ${selector}:`, error.message);
        }
      }
      
      // Enhanced scroll-based screenshots for dashboards
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

        console.log(`📏 Scroll range: 0 to ${maxScroll}px`);

        // Take initial screenshot (top of page)
        const topFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_scroll_${screenshotIndex}_top_${timestamp}.png`;
        const topFilepath = path.join(this.options.outputDir, topFilename);
        await page.screenshot({ path: topFilepath, type: 'png', fullPage: false });
        this.screenshotCount++;
        results.push({ type: 'scroll', url, scroll_position: 0, filename: topFilename });
        console.log(`✅ Top screenshot saved: ${topFilename}`);
        screenshotIndex++;

        // Take scroll screenshots
        if (maxScroll > 100 || pageInfo.hasScrollableContainers) { // Scroll if window has content OR containers exist
          console.log(`🔄 Scrolling strategy: ${maxScroll > 100 ? 'Window scroll' : 'Container scroll'}`);
          
          let totalScrollSteps = Math.max(
            Math.ceil(maxScroll / this.options.scrollStep),
            pageInfo.hasScrollableContainers ? Math.ceil((pageInfo.scrollableContainers[0]?.scrollHeight - pageInfo.scrollableContainers[0]?.clientHeight || 0) / this.options.scrollStep) : 0
          );
          
          totalScrollSteps = Math.min(totalScrollSteps, this.options.maxScrollScreenshots - 1); // -1 because we already took top screenshot
          
          console.log(`📋 Planning ${totalScrollSteps} scroll screenshots`);
          
          for (let step = 1; step <= totalScrollSteps; step++) {
            if (screenshotIndex >= this.options.maxScrollScreenshots) break;
            
            // Calculate scroll position
            if (maxScroll > 100) {
              // Use window scrolling
              currentScroll = Math.min((step * this.options.scrollStep), maxScroll);
              
              await page.evaluate((scrollY) => {
                window.scrollTo({ top: scrollY, behavior: 'smooth' });
              }, currentScroll);
            } else if (pageInfo.hasScrollableContainers) {
              // Use container scrolling
              const container = pageInfo.scrollableContainers[0];
              const containerMaxScroll = container.scrollHeight - container.clientHeight;
              currentScroll = Math.min((step * this.options.scrollStep), containerMaxScroll);
              
              await page.evaluate((params) => {
                const { scrollY } = params;
                // Find the scrollable container
                const containers = Array.from(document.querySelectorAll('main, [class*="overflow"], [class*="scroll"]')).filter(el => {
                  const style = getComputedStyle(el);
                  return (style.overflow === 'auto' || style.overflow === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                         el.scrollHeight > el.clientHeight;
                });
                
                if (containers.length > 0) {
                  const mainContainer = containers.find(c => c.tagName === 'MAIN') || containers[0];
                  console.log(`Scrolling container to ${scrollY}px`);
                  mainContainer.scrollTo({ top: scrollY, behavior: 'smooth' });
                } else {
                  // Fallback to window scroll
                  window.scrollTo({ top: scrollY, behavior: 'smooth' });
                }
              }, { scrollY: currentScroll });
            }

            // Wait for scroll to complete and content to load
            await page.waitForTimeout(this.options.scrollDelay);
            await this.waitForContent(page);

            const filename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_scroll_${screenshotIndex}_${currentScroll}px_${timestamp}.png`;
            const filepath = path.join(this.options.outputDir, filename);
            await page.screenshot({ path: filepath, type: 'png', fullPage: false });
            this.screenshotCount++;
            results.push({ type: 'scroll', url, scroll_position: currentScroll, filename });
            console.log(`✅ Scroll screenshot saved: ${filename} (${currentScroll}px)`);
            screenshotIndex++;
          }
        } else {
          console.log(`ℹ️ No significant scroll content detected (window: ${maxScroll}px, containers: ${pageInfo.hasScrollableContainers})`);
        }
      }

      // Full page screenshot
      if (fullPage) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1000);
        
        const fullPageFilename = `${String(this.screenshotCount + 1).padStart(3, '0')}_${baseName}_fullpage_${timestamp}.png`;
        const fullPageFilepath = path.join(this.options.outputDir, fullPageFilename);
        await page.screenshot({ path: fullPageFilepath, type: 'png', fullPage: true });
        this.screenshotCount++;
        results.push({ type: 'fullpage', url, filename: fullPageFilename });
        console.log(`✅ Full page screenshot saved: ${fullPageFilename}`);
      }

    } catch (error) {
      console.error(`❌ Failed to screenshot ${url}:`, error.message);
      results.push({ type: 'error', url, error: error.message });
    } finally {
      await page.close();
    }
    
    return results;
  }

  async crawlAndScreenshot(startUrl, depth = 0) {
    if (depth > this.options.maxDepth || this.visitedUrls.size >= this.options.maxPages) {
      return;
    }

    if (!this.shouldVisitUrl(startUrl, startUrl)) {
      return;
    }

    this.visitedUrls.add(startUrl);
    
    // Screenshot this page
    const pageResults = await this.screenshotPage(startUrl);
    this.results.push(...pageResults);
    
    // Extract links and continue crawling
    if (depth < this.options.maxDepth) {
      const page = await this.context.newPage();
      
      try {
        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: this.options.timeout });
        const links = await this.extractLinks(page);
        
        console.log(`🔗 Found ${links.length} links on ${startUrl}`);
        
        for (const link of links) {
          if (this.visitedUrls.size >= this.options.maxPages) break;
          
          if (this.shouldVisitUrl(link, startUrl)) {
            await this.crawlAndScreenshot(link, depth + 1);
          }
        }
      } catch (error) {
        console.error(`❌ Error extracting links from ${startUrl}:`, error.message);
      } finally {
        await page.close();
      }
    }
  }

  async generateReport() {
    const reportPath = path.join(this.options.outputDir, 'screenshot_report.json');
    const report = {
      timestamp: new Date().toISOString(),
      total_screenshots: this.screenshotCount,
      total_pages: this.visitedUrls.size,
      results: this.results,
      options: this.options
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📋 Report saved to: ${reportPath}`);
  }

  async run(mode, target, options = {}) {
    await this.init();
    
    try {
      // Try to load existing session
      await this.loadSession();
      
      // Note: Login will be attempted automatically when pages redirect to login
      
      // Show what mode we're using
      if (this.options.useAI && this.aiAnalyzer) {
        console.log(`🧠 Starting AI-powered ${mode} mode...`);
        console.log(`   Using: ${this.options.aiModel}`);
      } else {
        console.log(`⚡ Starting fast ${mode} mode...`);
        if (this.options.handleTabs) {
          console.log(`   Tab detection: enabled`);
        }
        if (this.options.openrouterApiKey && !this.options.useAI) {
          console.log(`💡 Use --ai flag to enable AI features`);
        }
      }
      
      switch (mode) {
        case 'element':
          const elementResults = await this.screenshotElement(target, options.selector, options);
          this.results.push(...elementResults);
          break;
          
        case 'region':
          const regionResults = await this.screenshotRegion(target, options.region, options);
          this.results.push(...regionResults);
          break;
          
        case 'page':
          const pageResults = await this.screenshotPage(target, options);
          this.results.push(...pageResults);
          break;
          
              
        

          

          
        case 'crawl':
          await this.crawlAndScreenshot(target);
          break;
          
        default:
          throw new Error(`Unknown mode: ${mode}`);
      }
      
      await this.generateReport();
      
      console.log(`\n✨ Screenshot task completed!`);
      console.log(`📊 Total screenshots taken: ${this.screenshotCount}`);
      console.log(`📁 Screenshots saved to: ${path.resolve(this.options.outputDir)}`);
      
    } catch (error) {
      console.error('❌ Screenshot task failed:', error);
    } finally {
      await this.close();
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📸 Fast Web Application Screenshot Tool

Quick and efficient screenshot capture for any web application.
Fast scrolling and comprehensive page coverage by default.

Core Commands:
  node dev-screenshot-tool.js page [url]              Fast page screenshots
  node dev-screenshot-tool.js crawl [url]             Site crawling
  node dev-screenshot-tool.js element <selector> [url] Screenshot specific element
  node dev-screenshot-tool.js region <x,y,w,h> [url]   Screenshot specific region

Element Shortcuts:
  node dev-screenshot-tool.js nav [url]               Navigation screenshots
  node dev-screenshot-tool.js header [url]            Header screenshots
  node dev-screenshot-tool.js footer [url]            Footer screenshots
  node dev-screenshot-tool.js hero [url]              Hero section screenshots
  node dev-screenshot-tool.js sidebar [url]           Sidebar screenshots

Options:
  --ai, -a                    Enable AI-powered features (slower but smarter)
  --tabs, -t                  Enable tab detection and clicking
  --help, -h                  Show this help message

Examples:
  # Fast page capture (default - no AI, just scrolling)
  node dev-screenshot-tool.js page /dashboard

  # AI-powered page capture with tab detection
  node dev-screenshot-tool.js page /dashboard --ai

  # Site crawling with AI navigation
  node dev-screenshot-tool.js crawl --ai

  # Quick element capture
  node dev-screenshot-tool.js nav /admin

Setup:
1. Copy screenshot-config.example.json to screenshot-config.json
2. Edit with your settings (optional - works with defaults)
3. Add OpenRouter API key for AI features (optional)

Sample config:
{
  "baseUrl": "http://localhost:3000",
  "authentication": { "required": true, "loginUrl": "...", "credentials": {...} }
}
`);
    return;
  }

  // Parse command line arguments
  const parsedArgs = [];
  const flags = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flag = arg.slice(2);
      flags[flag] = true;
    } else if (arg.startsWith('-') && arg.length === 2) {
      const flag = arg.slice(1);
      if (flag === 'a') flags.ai = true;
      else if (flag === 't') flags.tabs = true;
      else if (flag === 'h') flags.help = true;
    } else {
      parsedArgs.push(arg);
    }
  }
  
  if (flags.help) {
    console.log(`
📸 Fast Web Application Screenshot Tool

Quick and efficient screenshot capture for any web application.
Fast scrolling and comprehensive page coverage by default.

Core Commands:
  node dev-screenshot-tool.js page [url]              Fast page screenshots
  node dev-screenshot-tool.js crawl [url]             Site crawling
  node dev-screenshot-tool.js element <selector> [url] Screenshot specific element
  node dev-screenshot-tool.js region <x,y,w,h> [url]   Screenshot specific region

Element Shortcuts:
  node dev-screenshot-tool.js nav [url]               Navigation screenshots
  node dev-screenshot-tool.js header [url]            Header screenshots
  node dev-screenshot-tool.js footer [url]            Footer screenshots
  node dev-screenshot-tool.js hero [url]              Hero section screenshots
  node dev-screenshot-tool.js sidebar [url]           Sidebar screenshots

Options:
  --ai, -a                    Enable AI-powered features (slower but smarter)
  --tabs, -t                  Enable tab detection and clicking
  --help, -h                  Show this help message

Examples:
  # Fast page capture (default - no AI, just scrolling)
  node dev-screenshot-tool.js page /dashboard

  # AI-powered page capture with tab detection
  node dev-screenshot-tool.js page /dashboard --ai

  # Site crawling with AI navigation
  node dev-screenshot-tool.js crawl --ai

  # Quick element capture
  node dev-screenshot-tool.js nav /admin

Setup:
1. Copy screenshot-config.example.json to screenshot-config.json
2. Edit with your settings (optional - works with defaults)
3. Add OpenRouter API key for AI features (optional)

Sample config:
{
  "baseUrl": "http://localhost:3000",
  "authentication": { "required": true, "loginUrl": "...", "credentials": {...} }
}
`);
    return;
  }

  // Load configuration
  const config = await loadConfig();
  
  const mode = parsedArgs[0];
  let target = parsedArgs[1];
  
  // Convert config to tool options
  const options = {
    outputDir: config.screenshots?.outputDir || './screenshots',
    maxPages: config.crawling?.maxPages || 50,
    maxDepth: config.crawling?.maxDepth || 3,
    viewport: config.browser?.viewport || { width: 1920, height: 1080 },
    userDataDir: config.browser?.userDataDir || './browser-session',
    headless: config.browser?.headless !== false,
    timeout: config.browser?.timeout || 30000,
    delay: config.screenshots?.delay || 2000,
    scrollDelay: config.screenshots?.scrollDelay || 1500,
    scrollStep: config.screenshots?.scrollStep || 800,
    maxScrollScreenshots: config.screenshots?.maxScrollScreenshots || 10,
    excludePatterns: config.crawling?.excludePatterns || ['/api/', '.pdf', '.zip'],
    
    // Tab handling options - only enable if explicitly requested
    handleTabs: flags.tabs || flags.ai,
    tabSelectors: config.tabs?.selectors || undefined,
    tabContainerSelectors: config.tabs?.containerSelectors || undefined,
    tabDelay: config.tabs?.delay || 1500,
    maxTabsPerPage: config.tabs?.maxPerPage || 10,
    
    // AI options - only enable if explicitly requested
    openrouterApiKey: config.ai?.openrouterApiKey || process.env.OPENROUTER_API_KEY,
    useAI: flags.ai && (config.ai?.openrouterApiKey || process.env.OPENROUTER_API_KEY),
    aiModel: config.ai?.model || 'deepseek/deepseek-chat-v3-0324:free'
  };

  // Login configuration from config file
  if (config.authentication?.required && config.authentication?.credentials) {
    options.loginUrl = config.authentication.loginUrl;
    options.loginCredentials = {
      usernameSelector: config.authentication.credentials.usernameSelector,
      passwordSelector: config.authentication.credentials.passwordSelector,
      submitSelector: config.authentication.credentials.submitSelector,
      username: config.authentication.credentials.username,
      password: config.authentication.credentials.password
    };
  }

  const tool = new DevScreenshotTool(options);
  const modeOptions = {};

  // Handle URL resolution
  const baseUrl = config.baseUrl || 'http://localhost:3000';
  
  // If target looks like a path (starts with /), prepend baseUrl
  if (target && target.startsWith('/')) {
    target = baseUrl + target;
  } else if (!target) {
    target = baseUrl; // Use base URL if no target specified
  } else if (!target.startsWith('http')) {
    // If it's not a URL, treat it as a path
    target = baseUrl + (target.startsWith('/') ? target : '/' + target);
  }

  // Handle common element shortcuts
  const commonElements = config.commonElements || {};
  const elementShortcuts = {
    'nav': commonElements.navigation || 'nav, .navbar, .navigation',
    'navigation': commonElements.navigation || 'nav, .navbar, .navigation',
    'header': commonElements.header || 'header, .header',
    'footer': commonElements.footer || 'footer, .footer',
    'sidebar': commonElements.sidebar || '.sidebar, .side-nav, aside',
    'main': commonElements.main || 'main, .main-content, .content',
    'hero': commonElements.hero || '.hero, .hero-section, .banner',
    'form': commonElements.forms || 'form, .form-container'
  };

  if (elementShortcuts[mode]) {
    // It's a common element shortcut
    modeOptions.selector = elementShortcuts[mode];
    await tool.run('element', target, modeOptions);
  } else if (mode === 'element') {
    modeOptions.selector = target;
    target = args[2] ? (args[2].startsWith('http') ? args[2] : baseUrl + (args[2].startsWith('/') ? args[2] : '/' + args[2])) : baseUrl;
    await tool.run('element', target, modeOptions);
  } else if (mode === 'region') {
    const coords = target.split(',').map(n => parseInt(n));
    modeOptions.region = { x: coords[0], y: coords[1], width: coords[2], height: coords[3] };
    target = args[2] ? (args[2].startsWith('http') ? args[2] : baseUrl + (args[2].startsWith('/') ? args[2] : '/' + args[2])) : baseUrl;
    await tool.run('region', target, modeOptions);
  } else {
    await tool.run(mode, target, modeOptions);
  }
}

// Export for use as module
module.exports = { DevScreenshotTool };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}