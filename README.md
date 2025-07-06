# Screen Capture Tool

A powerful AI-powered web application screenshot tool with authentication support, intelligent crawling, and comprehensive page analysis.

## Features

- 🧠 **AI-Powered Analysis** - Uses AI to understand page structure and detect tabs
- 🔐 **Authentication Support** - Automatic login handling for protected pages
- 🕷️ **Intelligent Crawling** - Discovers and captures all pages in your application
- 📸 **Smart Screenshots** - Scroll-based and full-page captures with tab detection
- 💾 **Session Persistence** - Saves browser sessions for faster subsequent runs
- 🎯 **Flexible Configuration** - Highly configurable for different use cases

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Configuration (Optional)
Copy the example configuration and customize it:
```bash
npm run setup
```

Edit `screenshot-config.json` with your settings:
- Update `baseUrl` to your application URL
- Add your OpenRouter API key for AI features (optional)
- Configure authentication credentials if needed

### 3. Run Screenshots

#### Fast Page Capture (Default - No AI)
```bash
npm run page http://localhost:3000/features
```

#### AI-Powered Page Capture
```bash
npm run page:ai http://localhost:3000/features
# or
npm run page http://localhost:3000/features --ai
```

#### Fast Site Crawling
```bash
npm run crawl
```

#### AI-Powered Site Crawling
```bash
npm run crawl:ai
# or
npm run crawl --ai
```

#### Capture Protected Pages
```bash
npm run crawl http://localhost:3000/dashboard
```

## Configuration

### Authentication Setup
```json
{
  "authentication": {
    "required": true,
    "loginUrl": "http://localhost:3000/login",
    "credentials": {
      "username": "your-email@example.com",
      "password": "your-password",
      "usernameSelector": "#email",
      "passwordSelector": "#password",
      "submitSelector": "button[type='submit']"
    }
  }
}
```

### AI Configuration
```json
{
  "ai": {
    "enabled": true,
    "openrouterApiKey": "your-api-key-here",
    "model": "deepseek/deepseek-chat-v3-0324:free"
  }
}
```

## Commands

### Core Commands
- `npm run page [url]` - Capture a single page
- `npm run crawl [url]` - Crawl and capture all pages
- `npm run element <selector> [url]` - Capture specific element
- `npm run region <x,y,w,h> [url]` - Capture specific region

### Element Shortcuts
- `npm run nav [url]` - Navigation screenshots
- `npm run header [url]` - Header screenshots
- `npm run footer [url]` - Footer screenshots
- `npm run hero [url]` - Hero section screenshots

## Output

Screenshots are saved to the `screenshots/` directory with the following naming convention:
- `001_page_scroll_0_top_timestamp.png` - Top of page
- `002_page_scroll_1_800px_timestamp.png` - Scrolled sections
- `003_page_fullpage_timestamp.png` - Full page
- `004_page_ai_tab_tabname_timestamp.png` - AI-detected tabs

## Security Notes

- The `.gitignore` file excludes sensitive files like `screenshot-config.json`
- Browser sessions and authentication data are not tracked
- Use environment variables for API keys in production

## Troubleshooting

### Login Issues
- Verify selectors in configuration match your login form
- Check if the login page URL is correct
- Ensure credentials are valid

### AI Analysis Issues
- Verify your OpenRouter API key is valid
- Check if the AI model is available
- The tool falls back to manual detection if AI fails

### Browser Issues
- Clear `browser-session/` directory if browser gets stuck
- Increase timeout values for slow-loading pages
- Use `headless: true` for server environments

## Examples

### Capture Features Page with Scrolling
```bash
npm run page /features
```

### Crawl Entire Application
```bash
npm run crawl
```

### Capture Dashboard After Login
```bash
npm run crawl /dashboard
```

### Capture Specific Element
```bash
npm run element ".hero-section" /homepage
```

## 🧠 MCP Tool: Automated Screenshot Capture for AI Agents

### Usage in Cursor (Model Context Protocol)

1. **Add the MCP Tool**
   - Place `mcp-screenshot.js` in your project root (already done).
   - Make it executable:
     ```bash
     chmod +x mcp-screenshot.js
     ```

2. **Register the Tool in Cursor**
   - In Cursor, open the Command Palette and search for "Add MCP Tool".
   - Select the script:
     ```
     ./mcp-screenshot.js
     ```
   - Set the tool to accept a URL argument (e.g., `/features` or a full URL).

3. **Run the Tool from Cursor**
   - In chat, invoke the MCP tool and provide the page URL you want to capture.
   - The tool will:
     - Capture screenshots of the page using your existing screenshot logic
     - Return the images directly to the AI agent as visible images in chat

### Example
```bash
# From terminal (for testing)
node mcp-screenshot.js http://localhost:3000/features
```

### Notes
- The tool outputs images in the MCP-compatible format (base64-encoded, with mime type)
- Works with any AI agent or platform that supports MCP tools and image input
- Screenshots are saved in the `screenshots/` directory as usual

## License

MIT License - see LICENSE file for details. 