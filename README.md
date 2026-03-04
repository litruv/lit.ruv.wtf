# lit.ruv.wtf

Interactive terminal interface for lit.ruv.wtf - A retro-styled command line experience with chat, documentation, and more.

## Features

- **Classic CRT Aesthetics**: Green phosphor terminal with authentic CRT effects including scanlines and subtle flicker
- **Interactive Chat**: Matrix-powered chat integration with real-time messaging
- **Keyboard Navigation**: Full keyboard support with arrow keys, history navigation, and standard terminal shortcuts
- **Mouse Support**: Click to position cursor, scroll through history, and interact with links
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Multiple Color Schemes**: Switch between green, amber, blue, and white phosphor themes
- **Command History**: Navigate through previous commands using up/down arrows
- **Bluesky Integration**: Fetch and display recent posts from Bluesky
- **Quick Links**: Easy access to documentation, GitHub, and social media

## Getting Started

### Quick Start

1. Open `index.html` directly in your browser, or
2. Serve with a local web server:

```bash
# Using Python 3
python3 -m http.server 8000

# Or using npm script
npm start

# Or using Node.js http-server
npx http-server -p 8000
```

3. Open `http://localhost:8000` in your browser

## Available Commands

- `help` - Display available commands
- `about` - Information about this terminal
- `clear` - Clear the terminal screen
- `echo [message]` - Echo back your message
- `date` - Display current date and time
- `whoami` - Display current user information
- `history` - Show command history
- `color [scheme]` - Change terminal color scheme (green, amber, blue, white)
- `banner` - Display welcome banner
- `bluesky [count]` - Fetch recent posts from Bluesky (default: 5)
- `chat` - Enter interactive chat (type /quit to exit)
- `github` - Visit GitHub repository
- `contact` - Display contact information
- `privacy` - Display privacy policy

## Chat Commands

While in chat mode (after running `chat`):

- `/help` - Show chat commands
- `/nick [name]` - Change your display name
- `/quit` or `/exit` - Exit chat mode

## Keyboard Shortcuts

- `↑/↓` - Navigate command history
- `←/→` - Move cursor within current line
- `Home` - Move cursor to start of line
- `End` - Move cursor to end of line
- `Ctrl+C` - Cancel current input
- `Ctrl+L` - Clear screen (keeping current input)
- `Enter` - Execute command
- `Backspace` - Delete character

## Mouse Support

- Click anywhere in the terminal to focus
- Scroll to view terminal history
- Click on links to open them

## Customization

### Colors

Change the color scheme by editing the theme in `terminal.js` or use the `color` command at runtime:

```
$ color amber
$ color blue
$ color white
$ color green
```

### Commands

Add new commands by extending the `commands` object in `terminal.js`:

```javascript
commands.mycommand = {
    description: 'My custom command',
    execute: (args) => {
        return 'Output from my command';
    }
};
```

## Technologies

- **xterm.js** - Terminal emulator for the web
- **xterm-addon-fit** - Responsive terminal sizing
- **xterm-addon-web-links** - Clickable URL support
- **Pure CSS** - Classic CRT effects and animations

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## License

MIT
