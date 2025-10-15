# AI Analyze Selection - Chrome Extension

A powerful Chrome extension that provides AI-powered analysis of selected text with mathematical problem solving and data visualization capabilities.

## Features

- **AI Text Analysis**: Get intelligent analysis of any selected text using GPT-4
- **Mathematical Problem Solving**: Step-by-step solutions with bold final answers and italic verification
- **Interactive Charts**: Built-in charting system for data visualization and function graphing
- **Smart Toggle**: Use the same hotkey to open/close the analysis panel
- **Dark Theme**: Sleek black interface with white text for optimal readability
- **Smooth Animations**: Professional fade-in/fade-out transitions
- **Timestamp Display**: Shows when analysis was performed
- **Copy Functionality**: Easy copying of AI responses

## Installation

### From Chrome Web Store
*Coming soon - extension will be published to the Chrome Web Store*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your extensions list

## Usage

1. **Select any text** on a webpage
2. **Press Alt+Shift+A** (or Cmd+Shift+A on Mac) to analyze
3. **View the AI analysis** in the bottom-right corner
4. **Press Alt+Shift+A again** to close the panel
5. **Copy results** using the Copy button

## Configuration

### API Key Setup
1. Click the extension icon in your browser toolbar
2. Click "Open Options"
3. Enter your OpenAI API key
4. Select your preferred model (default: GPT-4)
5. Save your settings

### Keyboard Shortcut
- **Default**: Alt+Shift+A (Windows/Linux) or Cmd+Shift+A (Mac)
- **Customizable**: Go to `chrome://extensions/shortcuts` to change

## Supported Content Types

### Text Analysis
- General text analysis and insights
- Content summarization
- Key point extraction
- Trend analysis

### Mathematical Problems
- Algebraic equations
- Calculus problems
- Geometry problems
- Statistics and probability
- Step-by-step solutions with verification

### Data Visualization
- Function graphing
- Data plotting
- Statistical charts
- Interactive visualizations

## Technical Details

### Architecture
- **Manifest V3**: Modern Chrome extension architecture
- **Content Scripts**: Injected into web pages for text selection
- **Background Service Worker**: Handles AI API calls and commands
- **Canvas Rendering**: Custom charting system for data visualization

### AI Integration
- **Model**: GPT-4 (configurable)
- **Provider**: OpenAI API
- **Temperature**: Optimized for accuracy (0.1 for math, 0.2 for general)
- **Context**: Intelligent prompt engineering for different content types

### Security
- **No external dependencies**: Self-contained charting system
- **Secure API calls**: Direct communication with OpenAI
- **Local storage**: API keys stored securely in Chrome sync
- **CSP compliant**: No external script loading

## Development

### Project Structure
```
ai-analyze-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for AI calls
├── content.js            # Content script for UI and text selection
├── content.css           # Styling for overlay and charts
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── options.html          # Settings page
├── options.js            # Settings functionality
└── README.md             # This file
```

### Building
No build process required - the extension runs directly from source files.

### Testing
1. Load the extension in developer mode
2. Test on various websites with different content types
3. Verify API key configuration works
4. Test keyboard shortcuts and UI interactions

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Privacy Policy

This extension:
- **Does not collect personal data**
- **Only sends selected text to OpenAI API**
- **Stores API key locally in Chrome sync**
- **Does not track user behavior**
- **Does not share data with third parties**

## Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Check this README for usage instructions
- **API Key**: Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/)

## Changelog

### Version 0.1.0
- Initial release
- AI text analysis with GPT-4
- Mathematical problem solving
- Interactive charting system
- Dark theme interface
- Toggle functionality
- Copy to clipboard
- Timestamp display

## Acknowledgments

- Built with OpenAI's GPT-4 API
- Uses Chrome Extension Manifest V3
- Custom charting system for data visualization
- Inter font for optimal readability