# MCP Screenshot Tool - Quick Reference

## TOOL: `mcp_screenshot_screenshot`

## ESSENTIAL PARAMETERS
```json
{
  "url": "https://example.com",              // REQUIRED
  "pageAnalysis": true,                      // Get page structure
  "loginCredentials": {                      // Auto-login
    "username": "user@example.com",
    "password": "password123"
  },
  "interactions": [                          // Interact with elements
    {"action": "click", "selector": ".btn", "screenshot": true},
    {"action": "fill", "selector": "#input", "value": "text"},
    {"action": "wait", "value": "3000"}
  ]
}
```

## ACTIONS
- `click` - Click element
- `hover` - Hover over element  
- `fill` - Type text in input
- `select` - Choose dropdown option
- `scroll` - Scroll to element or position
- `wait` - Pause for milliseconds

## SELECTOR STRATEGIES (AUTO-FALLBACK)
1. **Direct CSS**: `.button`, `#id`, `[data-testid="btn"]`
2. **Semantic**: Use `value` parameter with button text
3. **Intelligent**: Tool auto-fixes broken selectors

## BEST PRACTICES
1. **Always use**: `"pageAnalysis": true`
2. **For clicks**: `{"action": "click", "selector": ".btn", "value": "Button Text", "screenshot": true}`
3. **Add waits**: `{"action": "wait", "value": "2000"}` between interactions
4. **Login first**: Include `loginCredentials` for protected pages

## EXAMPLE CALLS

**Basic Screenshot:**
```json
{"url": "https://example.com"}
```

**Page Analysis:**
```json
{"url": "https://example.com", "pageAnalysis": true}
```

**With Login:**
```json
{
  "url": "https://app.example.com", 
  "loginCredentials": {"username": "user@email.com", "password": "pass123"},
  "pageAnalysis": true
}
```

**Click Button:**
```json
{
  "url": "https://example.com",
  "interactions": [
    {"action": "click", "selector": ".submit-btn", "value": "Submit", "screenshot": true}
  ]
}
```

## RETURNS
- **Images**: Base64 PNG screenshots
- **Page Analysis**: JSON with links, buttons, forms, navigation elements

## ERROR HANDLING
- Tool continues if elements not found
- Multiple fallback strategies
- Debug screenshots on errors

## KEY PARAMETERS
- `url` (required): Target website
- `pageAnalysis` (boolean): Extract page structure
- `loginCredentials` (object): Auto-login
- `interactions` (array): Element interactions
- `fullPage` (boolean): Full page screenshot (default: true)
- `scrollScreenshots` (boolean): Scroll capture (default: true) 