# MCP Screenshot Tool for Cursor

A powerful AI-powered screenshot tool designed specifically for Cursor IDE, enabling AI agents to capture and analyze web pages intelligently.

## Features

- 🤖 **AI-First Design** - Built for AI agents to understand and interact with web pages
- 🔐 **Authentication Support** - Handles login flows automatically
- 📊 **Smart Content Analysis** - Detects and captures dynamic content, tabs, and interactive elements
- 📸 **Comprehensive Capture** - Takes full-page, scrolling, and element-specific screenshots
- ⚡ **Intelligent Waiting** - Adapts to page content and ensures proper rendering

## Setup in Cursor

1. **Clone Repository**
```bash
git clone https://github.com/arnavv-guptaa/screenshot-mcp.git
cd mcp-screenshot
npm install
```

2. **Configure MCP Server**
   1. Open Cursor Settings
   2. Navigate to "Tools & Integration"
   3. Click "New MCP Server"
   4. Add the following configuration (replace the paths with your local clone path):
   ```json
   {
     "mcpServers": {
       "screenshot": {
         "type": "local",
         "command": "node",
         "args": ["/Users/username/path/to/screenshot-mcp/mcp-screenshot.js"],
         "cwd": "/Users/username/path/to/screenshot-mcp"
       }
     }
   }
   ```
   5. Save the configuration
   6. Verify that "1 tool enabled" appears in the MCP server status
   7. Make sure the MCP server is active (toggle if needed)

3. **Configure Authentication (Optional)**
Create `screenshot-config.json` in your cloned repository:
```json
{
  "authentication": {
    "required": true,
    "credentials": {
      "username": "your-username",
      "password": "your-password"
    }
  }
}
```

## Usage Guide for AI Agents

### Basic Screenshot
Simply provide the URL to capture:
```
@https://example.com
Can you take a screenshot of this page?
```

### Authentication Required
For protected pages, provide credentials:
```
@https://app.example.com/dashboard
Can you capture this page? Here are the credentials:
username: user@example.com
password: pass123
```

### Dynamic Content
The tool automatically:
- Waits for content to load
- Detects and captures tabs
- Handles lazy-loaded content
- Ensures charts and data are rendered

Example:
```
@https://app.example.com/analytics
Can you capture all tabs in the analytics dashboard?
```

### Element Specific
Capture specific components:
```
@https://example.com/pricing
Can you capture just the pricing table?
```

## Best Practices for Users

1. **Authentication**
   - Provide credentials when requesting protected pages
   - Mention if there's a specific login flow

2. **Dynamic Content**
   - Let the agent know about interactive elements
   - Mention if specific tabs or sections need focus

3. **Performance**
   - Allow time for complex pages to load
   - Mention if certain elements need special attention

## Capabilities

The tool can:
- Handle single-page applications (SPAs)
- Navigate and capture multiple tabs
- Wait for dynamic content to load
- Capture specific elements
- Handle various authentication flows
- Analyze page structure
- Detect and interact with UI components

## Examples

1. **Basic Page Capture**
```
Can you take a screenshot of https://example.com?
```

2. **Protected Dashboard**
```
Can you capture https://app.example.com/dashboard?
Login credentials:
user: admin@example.com
pass: admin123
```

3. **Multi-Tab Interface**
```
Can you capture all tabs on https://app.example.com/settings?
Make sure to wait for each tab's content to load.
```

4. **Complex Data Views**
```
Can you capture the analytics dashboard at https://app.example.com/analytics?
Please ensure all charts are fully rendered.
```

## Notes

- The tool automatically handles most scenarios without special configuration
- Screenshots are processed and displayed directly in the Cursor chat
- The tool adapts its waiting strategy based on page content
- Authentication sessions are managed automatically
