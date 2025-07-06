# Simple Screenshot Tool Setup

## 📦 One-Time Setup

### Step 1: Install Files
```bash
# Create directory and install files
mkdir screenshot-tool
cd screenshot-tool

# Save these files:
# - dev-screenshot-tool.js (main script)
# - package.json 
# - setup.sh (setup script)

npm install
npx playwright install chromium
```

### Step 2: Create Your Config
```bash
# Run the setup script
chmod +x setup.sh
./setup.sh

# OR create screenshot-config.json manually
```

### Step 3: Edit Your Config
Open `screenshot-config.json` and update these fields:

```json
{
  "baseUrl": "http://localhost:3000",          // ← Your app URL
  
  "authentication": {
    "loginUrl": "http://localhost:3000/login", // ← Your login page
    "credentials": {
      "username": "your-email@example.com",    // ← Your login email
      "password": "your-password",             // ← Your password
      "usernameSelector": "#email",            // ← CSS selector for email field
      "passwordSelector": "#password",         // ← CSS selector for password field
      "submitSelector": "button[type='submit']" // ← CSS selector for login button
    }
  }
}
```

## 🎯 How to Find CSS Selectors

1. **Open your login page** in browser
2. **Right-click on email field** → Inspect Element
3. **Look for `id` or `name`**:
   - If you see `<input id="email">` → use `"#email"`
   - If you see `<input name="username">` → use `"[name='username']"`
   - If you see `<input type="email">` → use `"input[type='email']"`

4. **Repeat for password field and submit button**

### Common Examples:
```json
// If your HTML looks like this:
// <input id="email" type="email">
// <input id="password" type="password">  
// <button type="submit">Login</button>

"usernameSelector": "#email",
"passwordSelector": "#password", 
"submitSelector": "button[type='submit']"

// Or if it looks like this:
// <input name="username">
// <input name="pwd">
// <button class="login-btn">Sign In</button>

"usernameSelector": "[name='username']",
"passwordSelector": "[name='pwd']",
"submitSelector": ".login-btn"
```

## 🚀 Daily Usage (After Setup)

### Simple Commands:
```bash
# Screenshot homepage
node dev-screenshot-tool.js page

# Screenshot navigation bar
node dev-screenshot-tool.js nav

# Screenshot hero section
node dev-screenshot-tool.js hero

# Screenshot specific page
node dev-screenshot-tool.js page /dashboard

# Screenshot custom element
node dev-screenshot-tool.js element ".pricing-table"

# Screenshot entire authenticated site
node dev-screenshot-tool.js crawl
```

### What Happens:
1. **First run**: Browser opens, you log in manually, tool saves your session
2. **All future runs**: Automatically logged in, takes screenshots instantly

## 📋 Example Workflow

### Your First Run:
```bash
# This will open a browser window
node dev-screenshot-tool.js page

# When browser opens:
# 1. You'll see your login page
# 2. Log in manually (type username/password, click login)
# 3. Tool takes screenshots
# 4. Browser closes
# 5. Your login session is saved!
```

### Every Run After:
```bash
# Same command, but now automatic!
node dev-screenshot-tool.js page

# Tool automatically:
# 1. Opens browser (invisible)
# 2. You're already logged in
# 3. Takes screenshots
# 4. Done!
```

## 🔧 Troubleshooting

### Problem: "Login failed"
**Solution**: Check your CSS selectors
```bash
# Run with visible browser to debug
node dev-screenshot-tool.js page

# Watch what happens during login
# Update selectors in screenshot-config.json
```

### Problem: "No browser window opens"
**Solution**: Set headless to false in config:
```json
{
  "browser": {
    "headless": false
  }
}
```

### Problem: "Element not found"
**Solution**: Check element selectors:
```bash
# Try different selectors
node dev-screenshot-tool.js element "nav"
node dev-screenshot-tool.js element ".navbar"
node dev-screenshot-tool.js element ".navigation"
```

### Problem: "Session expired"
**Solution**: Delete session and start fresh:
```bash
rm -rf browser-session/
node dev-screenshot-tool.js page
# Log in manually again
```

## 🎯 Real Examples

### For E-commerce App:
```json
{
  "baseUrl": "http://localhost:3000",
  "authentication": {
    "loginUrl": "http://localhost:3000/admin/login",
    "credentials": {
      "username": "admin@shop.com",
      "password": "admin123",
      "usernameSelector": "#adminEmail",
      "passwordSelector": "#adminPassword",
      "submitSelector": ".login-button"
    }
  }
}
```

### For Dashboard App:
```json
{
  "baseUrl": "http://localhost:3000", 
  "authentication": {
    "loginUrl": "http://localhost:3000/signin",
    "credentials": {
      "username": "user@company.com",
      "password": "mypassword",
      "usernameSelector": "input[type='email']",
      "passwordSelector": "input[type='password']",
      "submitSelector": "button[type='submit']"
    }
  }
}
```

## 🎉 You're Done!

After setup, just use these simple commands:

```bash
node dev-screenshot-tool.js page           # Homepage
node dev-screenshot-tool.js nav            # Navigation
node dev-screenshot-tool.js hero           # Hero section  
node dev-screenshot-tool.js page /settings # Settings page
node dev-screenshot-tool.js crawl          # Everything!
```

**No more environment variables, no more complex commands - just simple, powerful screenshots!** 📸