# MCP Screenshot Tool - LLM Usage Guide

## TOOL NAME: `mcp_screenshot_screenshot`

## BASIC USAGE
```json
{
  "url": "https://example.com"
}
```

## ALL PARAMETERS

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | ✅ YES | - | Target website URL |
| `fullPage` | boolean | No | true | Capture full page screenshot |
| `scrollScreenshots` | boolean | No | true | Capture scroll-based screenshots |
| `viewport` | object | No | `{width:1920,height:1080}` | Browser viewport size |
| `pageAnalysis` | boolean | No | false | Extract page structure & elements |
| `loginCredentials` | object | No | null | Auto-login configuration |
| `interactions` | array | No | null | Element interactions to perform |
| `navigationFlow` | object | No | null | Multi-page navigation |

## QUICK EXAMPLES

### 1. Basic Screenshot
```json
{
  "url": "https://example.com"
}
```

### 2. With Page Analysis
```json
{
  "url": "https://example.com",
  "pageAnalysis": true
}
```

### 3. With Login
```json
{
  "url": "https://example.com/dashboard",
  "loginCredentials": {
    "username": "user@example.com",
    "password": "password123"
  }
}
```

### 4. With Interactions
```json
{
  "url": "https://example.com",
  "interactions": [
    {"action": "click", "selector": ".menu-button", "screenshot": true},
    {"action": "fill", "selector": "#search", "value": "test query"},
    {"action": "wait", "value": "3000"}
  ]
}
```

## DETAILED PARAMETERS

### `loginCredentials` Object
```json
{
  "username": "user@example.com",           // Required
  "password": "password123",                // Required  
  "loginUrl": "https://site.com/login",     // Optional: specific login page
  "usernameSelector": "#email",             // Optional: custom username field selector
  "passwordSelector": "#password",          // Optional: custom password field selector
  "submitSelector": "#login-button"         // Optional: custom submit button selector
}
```

### `interactions` Array - Available Actions
```json
[
  {"action": "click", "selector": ".button", "screenshot": true},
  {"action": "hover", "selector": ".menu-item"},
  {"action": "fill", "selector": "#input", "value": "text to type"},
  {"action": "select", "selector": "#dropdown", "value": "option1"},
  {"action": "scroll", "selector": ".element"},
  {"action": "scroll", "value": "500"},
  {"action": "wait", "value": "3000"}
]
```

**Interaction Parameters:**
- `action`: Required. One of: click, hover, fill, select, scroll, wait
- `selector`: CSS selector (required except for wait)
- `value`: Text/number value (for fill, select, scroll, wait)
- `screenshot`: boolean - capture screenshot after this action
- `waitFor`: CSS selector to wait for after action

### `navigationFlow` Object
```json
{
  "followLinks": ["nav a", ".menu-item", "[role='navigation'] a"],
  "maxDepth": 2,
  "excludePatterns": ["/logout", "/delete", "/admin"],
  "screenshotEachPage": true
}
```

## ELEMENT DETECTION STRATEGIES

The tool uses multiple fallback strategies to find elements:

1. **Direct CSS Selector**: Uses provided selector exactly
2. **Semantic Locators**: getByRole, getByText, getByLabel 
3. **Intelligent Parsing**: Extracts IDs, classes, tag names
4. **Accessibility**: ARIA labels, titles, roles
5. **Fuzzy Matching**: Partial text matching with regex

**Best Selectors (in order of reliability):**
1. `data-testid` attributes: `[data-testid="login-button"]`
2. Semantic roles: Use `value` parameter for button text
3. Unique IDs: `#unique-id`
4. Stable classes: `.btn-primary`

## RETURN FORMAT

The tool returns:
1. **Images**: Base64-encoded PNG screenshots
2. **Page Analysis** (if requested): JSON structure with:
   - `links`: All clickable links with text and href
   - `buttons`: Interactive buttons with text and selectors  
   - `forms`: Form elements and input fields
   - `navigation`: Navigation menus and links
   - `hasModal`: Boolean for popup detection
   - `scrollHeight`: Page scroll dimensions

## ERROR HANDLING

- **Element not found**: Tool tries multiple strategies, continues with remaining interactions
- **Login failed**: Returns login page screenshot with status
- **Network issues**: Returns error message with details
- **Invalid selector**: Logs warning, attempts automatic fixes

## COMMON USE CASES

### E-commerce Site Analysis
```json
{
  "url": "https://shop.example.com/products",
  "pageAnalysis": true,
  "interactions": [
    {"action": "click", "selector": ".product-item", "screenshot": true},
    {"action": "scroll", "value": "500", "screenshot": true}
  ]
}
```

### Dashboard with Login
```json
{
  "url": "https://app.example.com/dashboard",
  "loginCredentials": {
    "username": "user@example.com", 
    "password": "password123"
  },
  "pageAnalysis": true,
  "scrollScreenshots": true
}
```

### Multi-page Site Exploration
```json
{
  "url": "https://example.com",
  "navigationFlow": {
    "followLinks": ["nav a", ".menu a"],
    "maxDepth": 3,
    "excludePatterns": ["/contact", "/logout"],
    "screenshotEachPage": true
  }
}
```

## TIPS FOR LLMs

1. **Always request `pageAnalysis: true`** when you need to understand page structure
2. **Use semantic selectors** - prefer button text over CSS classes
3. **Include screenshots in interactions** to see results: `"screenshot": true`
4. **Use wait actions** between interactions: `{"action": "wait", "value": "2000"}`
5. **Start simple** - basic screenshot first, then add complexity
6. **Handle authentication** - provide login credentials for protected pages

## LIMITATIONS

- **JavaScript-heavy sites**: May need wait times for content loading
- **CAPTCHAs**: Will return login page if encountered
- **Rate limiting**: Space out requests for same domain
- **Single session**: Each call is independent (no session persistence between calls)

## DEBUGGING

If interactions fail:
1. Check if `pageAnalysis` shows the elements exist
2. Try semantic selectors with `value` parameter
3. Add wait actions between interactions
4. Use `screenshot: true` to see page state

## EXAMPLE OUTPUT

Screenshots returned as base64 PNG images with descriptive names:
- `example_com_scroll_0_top.png`
- `example_com_scroll_1_800px.png` 
- `interaction_1_click.png`
- `example_com_fullpage.png`

Page analysis returned as structured JSON with all interactive elements. 